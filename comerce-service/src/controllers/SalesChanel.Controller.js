// controllers/SalesChannel.Controller.js
const { createSalesChannel, listSalesChannels, getSalesChannelById, updateSalesChannelById, createSalesChannelsBulk } = require('../models/SalesChanelModels'); 
const { nowSCLSql121 } = require('../utils/dates');

function getSqlNumber(err) {
  return (
    err?.number ??
    err?.originalError?.info?.number ??
    err?.originalError?.number ??
    err?.precedingErrors?.[0]?.number ??
    null
  );
}

async function postSalesChannel(req, res) {
  try {
    const body = req.body || {};
    if (!body.CompanyId) {
      return res.status(400).json({ ok: false, message: 'CompanyId es obligatorio' });
    }
    if (!body.Name) {
      return res.status(400).json({ ok: false, message: 'Name es obligatorio' });
    }

    // opcional: normalizar espacios
    const nameTrimmed = String(body.Name).trim();

    const created = await createSalesChannel({
      CompanyId:        Number(body.CompanyId),
      Name:             nameTrimmed,
      ExternalDelivery: body.ExternalDelivery ?? 0,
      IsActive:         body.IsActive ?? 1,
      CreatedAtStr:     nowSCLSql121(),
      UserCreated:      body.UserCreated ?? req.user?.usuarioId ?? null,
    });

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    const num = getSqlNumber(err);
    const msg = err?.originalError?.info?.message || '';

    // 547: violación FK (CompanyId inexistente o constraint)
    if (num === 547) {
      return res.status(400).json({
        ok: false,
        code: 'FK_VIOLATION',
        message: 'CompanyId no existe o viola la restricción de la base de datos.',
      });
    }

    // 2627/2601: violación de UNIQUE (UX_SalesChannel_Name)
    if (num === 2627 || num === 2601) {
      const isNameUnique =
        /UX_SalesChannel_Name/i.test(msg) || /UNIQUE.*Sales_Channel.*Name/i.test(msg);

      if (isNameUnique) {
        return res.status(409).json({
          ok: false,
          code: 'UNIQUE_NAME',
          message: 'Ya existe un canal de venta registrado con este nombre para la compañía.',
        });
      }

      return res.status(409).json({
        ok: false,
        code: 'UNIQUE_VIOLATION',
        message: 'Registro duplicado (restricción única).',
      });
    }

    console.error('postSalesChannel error:', {
      message: err?.message,
      number: num,
      info: err?.originalError?.info,
    });
    return res.status(500).json({ ok: false, message: 'Error creando canal de venta' });
  }
}

async function postSalesChannelsBulk(req, res) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ ok: false, message: 'Debes enviar un arreglo "items" con canales de venta.' });
    }

    // Normaliza cada item antes de enviar al model
    const prepared = items.map((raw) => ({
      CompanyId:        Number(raw.CompanyId),
      Name:             String(raw.Name ?? '').trim(),
      ExternalDelivery: raw.ExternalDelivery ?? 0,
      IsActive:         raw.IsActive ?? 1,
      CreatedAtStr:     nowSCLSql121(),
      UserCreated:      raw.UserCreated ?? req.user?.usuarioId ?? null,
    }));

    const { inserted, errors } = await createSalesChannelsBulk(prepared);

    // Decide status code según resultado
    if (inserted.length === 0) {
      // todo falló
      return res.status(400).json({
        ok: false,
        message: 'Ningún canal de venta fue creado.',
        summary: { total: items.length, inserted: 0, failed: errors.length },
        errors,
      });
    }

    if (errors.length === 0) {
      // todo OK
      return res.status(201).json({
        ok: true,
        message: `${inserted.length} canales de venta creados correctamente.`,
        summary: { total: items.length, inserted: inserted.length, failed: 0 },
        data: inserted,
      });
    }

    // Parcial: algunos OK, algunos fallaron (usamos 207 Multi-Status)
    return res.status(207).json({
      ok: true,
      message: `${inserted.length} creados, ${errors.length} con error.`,
      summary: { total: items.length, inserted: inserted.length, failed: errors.length },
      data: inserted,
      errors,
    });
  } catch (err) {
    console.error('postSalesChannelsBulk error:', err);
    return res.status(500).json({ ok: false, message: 'Error creando canales de venta masivos' });
  }
}


function parseIntOr(v, d) {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

async function getSalesChannels(req, res) {
  try {
    const page = parseIntOr(req.query.page, 1);
    const pageSize = parseIntOr(req.query.pageSize, 10);

    const filters = {
      search: req.query.search || undefined,                       // Name o CompanyName
      companyId: req.query.companyId ? Number(req.query.companyId) : undefined,
      isActive: req.query.isActive ?? undefined,                   // 0/1
      externalDelivery: req.query.externalDelivery ?? undefined,   // 0/1
    };

    const result = await listSalesChannels({ page, pageSize, filters });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('getSalesChannels error:', err);
    return res.status(500).json({ ok: false, message: 'Error obteniendo canales de venta' });
  }
}

async function getSalesChannel(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, message: 'Id inválido' });
    }

    const channel = await getSalesChannelById(id);
    if (!channel) {
      return res.status(404).json({ ok: false, message: 'Sales Channel no encontrado' });
    }

    return res.json({ ok: true, data: channel });
  } catch (err) {
    console.error('getSalesChannel error:', err);
    return res.status(500).json({ ok: false, message: 'Error obteniendo canal de venta' });
  }
}


function hasUpdatableFields(body) {
  return ['Name', 'ExternalDelivery', 'IsActive'].some(k => body[k] !== undefined);
}

async function putSalesChannel(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, message: 'Id inválido' });
    }

    const body = req.body || {};
    if (!hasUpdatableFields(body)) {
      return res.status(400).json({
        ok: false,
        message: 'Debes enviar al menos uno: Name, ExternalDelivery o IsActive',
      });
    }

    const userId =
      body.UserModified ??
      body.UserCreated ??
      req.user?.usuarioId ??
      null;

    if (userId === null || userId === undefined) {
      return res.status(400).json({ ok: false, message: 'UserModified (id de usuario) es obligatorio' });
    }

    const updated = await updateSalesChannelById(id, {
      Name: body.Name,
      ExternalDelivery: body.ExternalDelivery,
      IsActive: body.IsActive,
      UpdatedAtStr: nowSCLSql121(),
      UserModified: Number(userId),
    });

    if (!updated) {
      return res.status(404).json({ ok: false, message: 'Sales Channel no encontrado' });
    }

    return res.json({ ok: true, message: 'El canal de venta ha sido actualizado correctamente.' });
  } catch (err) {
    const num =
      err?.number ??
      err?.originalError?.info?.number ??
      err?.originalError?.number ??
      err?.precedingErrors?.[0]?.number ??
      null;

    if (num === 2627 || num === 2601) {
      const msg = err?.originalError?.info?.message || '';
      const isNameUnique = /UX_SalesChannel_Name/i.test(msg);
      return res.status(409).json({
        ok: false,
        code: isNameUnique ? 'UNIQUE_NAME' : 'UNIQUE_VIOLATION',
        message: isNameUnique
          ? 'Ya existe un canal de venta registrado con este nombre para la compañía.'
          : 'Violación de restricción única.',
      });
    }

    console.error('putSalesChannel error:', {
      message: err?.message,
      number: num,
      info: err?.originalError?.info,
    });
    return res.status(500).json({ ok: false, message: 'Error actualizando canal de venta' });
  }
}

module.exports = { postSalesChannel, getSalesChannels, getSalesChannel, putSalesChannel, postSalesChannelsBulk };
