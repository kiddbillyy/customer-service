// controllers/Company.Controller.js
const { createCompany, getCompanyById, getCompanyByReferenceId, getAllCompanies, updateCompanyById } = require('../models/CompanyModels');
const { nowSCLSql121 } = require('../utils/dates');
const { publishCompanyEvent } = require('../utils/Kafka/companyEvents'); 

async function postCompany(req, res) {
  try {
    const body = req.body || {};

    // Validación de campos obligatorios
    const camposObligatorios = ['LegalName', 'DocumentType', 'DocumentNumber', 'Status'];
    const faltantes = camposObligatorios.filter(campo => !body[campo] && body[campo] !== 0);
    if (faltantes.length > 0) {
      return res.status(400).json({
        ok: false,
        message: `Faltan campos obligatorios: ${faltantes.join(', ')}`
      });
    }

    const userId = body.UserCreated || req.user?.usuarioId || null;

    const created = await createCompany({
      ...body,
      CreatedAtStr: nowSCLSql121(), // hora local SCL como string
      UserCreated: userId
    });

    // 🔔 Publicar evento a Kafka (fire-and-forget para no afectar el 201 si falla Kafka)
    (async () => {
      try {
        await publishCompanyEvent({
          action: 'company.created',
          company: created,
          userId
        });
      } catch (e) {
        console.error('Kafka publish company.created failed:', e);
      }
    })();

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    console.error('postCompany error:', err);

    // Manejo específico para errores de índice único
    if (err.number === 2627 || err.number === 2601) {
      let mensaje = 'Ya existe un registro con el mismo valor.';
      if (err.message.includes('UX_Company_ReferenceId')) {
        mensaje = 'El ReferenceId ya está registrado.';
      } else if (err.message.includes('UX_Company_LegalName')) {
        mensaje = 'El LegalName ya está registrado.';
      } else if (err.message.includes('UX_Company_DocumentNumber')) {
        mensaje = 'El DocumentNumber ya está registrado.';
      }
      return res.status(400).json({ ok: false, message: mensaje });
    }

    return res.status(500).json({ ok: false, message: 'Error creando la compañía' });
  }
}

/**
 * GET /companies/:idOrRef?
 * También admite query params: ?companyId=123  o  ?referenceId=UUID
 */
async function getCompany(req, res) {
  try {
    // 1) Soportar path param o query params
    const idOrRef = req.params?.idOrRef;
    const { companyId, referenceId } = req.query || {};

    let company = null;

    // 2) Resolver fuente de búsqueda con prioridad: path > query
    if (idOrRef) {
      if (/^\d+$/.test(idOrRef)) {
        company = await getCompanyById(parseInt(idOrRef, 10));
      } else {
        company = await getCompanyByReferenceId(idOrRef);
      }
    } else if (companyId) {
      if (!/^\d+$/.test(companyId)) {
        return res.status(400).json({ ok: false, message: 'companyId debe ser numérico' });
      }
      company = await getCompanyById(parseInt(companyId, 10));
    } else if (referenceId) {
      company = await getCompanyByReferenceId(referenceId);
    } else {
      return res.status(400).json({
        ok: false,
        message: 'Debes enviar :idOrRef en la ruta o ?companyId / ?referenceId en la query'
      });
    }

    if (!company) {
      return res.status(404).json({ ok: false, message: 'Compañía no encontrada' });
    }

    return res.status(200).json({ ok: true, data: company });
  } catch (err) {
    console.error('getCompany error:', err);
    return res.status(500).json({ ok: false, message: 'Error obteniendo la compañía' });
  }
}

// OBTENER TODAS LAS COMPAÑÍAS
async function listCompanies(req, res) {
  try {
    const { orderBy, orderDir } = req.query;

    const companies = await getAllCompanies(orderBy, orderDir);

    return res.status(200).json({
      ok: true,
      count: companies.length,
      data: companies
    });
  } catch (err) {
    console.error('listCompanies error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error obteniendo la lista de compañías'
    });
  }
}

// ACTUALIZAR COMPAÑÍA POR ID
async function putCompany(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, message: 'El id debe ser numérico' });
    }

    const body = req.body || {};
    // UserModified es obligatorio en el body (según tu requerimiento)
    if (body.UserModified == null) {
      return res.status(400).json({ ok: false, message: 'UserModified es obligatorio en el body' });
    }

    // Solo pasamos campos permitidos + metadata de actualización
    const payload = {
      UpdatedAtStr: nowSCLSql121(),
      UserModified: body.UserModified
    };

    const updatable = [
      'LegalName',
      'BusinessName',
      'Tax',
      'Email',
      'PhoneNumber',
      'DocumentType',
      'DocumentNumber',
      'Status',
      'Industry'
    ];

    // 👇 Para meta.changedFields en el evento
    const changedFields = [];
    for (const k of updatable) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        payload[k] = body[k];
        changedFields.push(k);
      }
    }

    const updated = await updateCompanyById(id, payload);

    // 🔔 Publicar evento a Kafka (fire-and-forget)
    (async () => {
      try {
        await publishCompanyEvent({
          action: 'company.updated',
          company: updated,
          userId: body.UserModified,
          meta: { changedFields }
        });
      } catch (e) {
        console.error('Kafka publish company.updated failed:', e);
      }
    })();

    return res.status(200).json({ ok: true, data: updated });

  } catch (err) {
    console.error('putCompany error:', err);

    // Índices únicos violados
    if (err.number === 2627 || err.number === 2601) {
      let message = 'Ya existe un registro con el mismo valor.';
      const msg = String(err.message || '');
      if (msg.includes('UX_Company_LegalName')) {
        message = 'El LegalName ya está registrado.';
      } else if (msg.includes('UX_Company_DocumentNumber')) {
        message = 'El DocumentNumber ya está registrado.';
      } else if (msg.includes('UX_Company_ReferenceId')) {
        message = 'El ReferenceId ya está registrado.';
      }
      return res.status(400).json({ ok: false, message });
    }

    if (err.code === 'NO_FIELDS') {
      return res.status(400).json({ ok: false, message: 'No hay campos para actualizar' });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ ok: false, message: 'Compañía no encontrada' });
    }

    return res.status(500).json({ ok: false, message: 'Error actualizando la compañía' });
  }
}

module.exports = { postCompany, getCompany, listCompanies, putCompany };
