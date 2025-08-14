// controllers/Store.Controller.js
const { createStore, getStoreById, listStores, updateStoreById } = require('../models/StoreModels');
const { nowSCLSql121 } = require('../utils/dates');

function getSqlErrorNumber(err) {
  return (
    err?.number ??
    err?.originalError?.info?.number ??
    err?.originalError?.number ??
    err?.precedingErrors?.[0]?.number ??
    null
  );
}

function getSqlErrorMessage(err) {
  return (
    err?.originalError?.info?.message ??
    err?.message ??
    ''
  );
}

async function postStore(req, res) {
  try {
    const body = req.body || {};
    if (!body?.CompanyId) {
      return res.status(400).json({ ok: false, message: 'CompanyId es obligatorio' });
    }
    if (!body?.Name) {
      return res.status(400).json({ ok: false, message: 'Name es obligatorio' });
    }

    const created = await createStore({
      ...body,
      Status: body.Status ?? 1,
      CreatedAtStr: nowSCLSql121(),
      UserCreated: body.UserCreated || req.user?.usuarioId || null,
    });

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    const num = getSqlErrorNumber(err);
    const msg = getSqlErrorMessage(err) || '';

    // 547 = violación de FK / CHECK (CompanyId no existe)
    if (num === 547) {
      return res.status(400).json({
        ok: false,
        code: 'FK_VIOLATION',
        message: 'CompanyId no existe o viola la restricción de la base de datos.',
      });
    }

    // 2627 (PRIMARY KEY/UNIQUE) o 2601 (índice único duplicado)
    if (num === 2627 || num === 2601) {
      // Intenta identificar si el choque fue por UX_Store_Name
      const isNameUnique =
        /UX_Store_Name/i.test(msg) || /UNIQUE.*Name/i.test(msg);

      return res.status(409).json({
        ok: false,
        code: isNameUnique ? 'UNIQUE_NAME' : 'UNIQUE_VIOLATION',
        message: isNameUnique
          ? 'Ya existe una tienda con ese Nombre.'
          : 'Registro duplicado (violación de restricción única).',
      });
    }

    console.error('postStore error:', {
      message: err?.message,
      number: num,
      code: err?.code,
      info: err?.originalError?.info,
    });

    return res.status(500).json({ ok: false, message: 'Error creando la tienda' });
  }
}

async function getStore(req, res) {
  try {
    const storeId = parseInt(req.params.id, 10);
    if (isNaN(storeId)) {
      return res.status(400).json({ ok: false, message: 'Id inválido' });
    }

    const store = await getStoreById(storeId);
    if (!store) {
      return res.status(404).json({ ok: false, message: 'Store no encontrada' });
    }

    return res.json({ ok: true, data: store });
  } catch (err) {
    console.error('getStore error:', err);
    return res.status(500).json({ ok: false, message: 'Error obteniendo la tienda' });
  }
}

function parseIntOr(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

async function getStores(req, res) {
  try {
    const page = parseIntOr(req.query.page, 1);
    const pageSize = parseIntOr(req.query.pageSize, 10);

    const filters = {
      search: req.query.search || undefined,                 // busca en CompanyName (c.LegalName), s.Name, s.Email, s.PhoneNumber
      status: req.query.status ?? undefined,                 // 0/1
      companyId: req.query.companyId ? Number(req.query.companyId) : undefined,
    };

    const result = await listStores({ page, pageSize, filters });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('getStores error:', err);
    return res.status(500).json({ ok: false, message: 'Error obteniendo stores' });
  }
}

// helper simple
function hasUpdatableFields(body) {
  return ['Name', 'Email', 'PhoneNumber', 'Status'].some(k => body[k] !== undefined);
}

async function putStore(req, res) {
  try {
    const storeId = parseInt(req.params.id, 10);
    if (Number.isNaN(storeId)) {
      return res.status(400).json({ ok: false, message: 'Id inválido' });
    }

    const body = req.body || {};
    if (!hasUpdatableFields(body)) {
      return res.status(400).json({
        ok: false,
        message: 'Debes enviar al menos uno: Name, Email, PhoneNumber o Status',
      });
    }

    // UserModified: permitido pasarlo como UserModified o (como pediste) el id de UserCreated
    const userId =
      body.UserModified ??
      body.UserCreated ?? // por si lo envías con ese nombre
      req.user?.usuarioId ?? null;

    if (userId === null || userId === undefined) {
      return res.status(400).json({
        ok: false,
        message: 'UserModified (id de usuario) es obligatorio',
      });
    }

    const updated = await updateStoreById(storeId, {
      Name: body.Name,
      Email: body.Email,
      PhoneNumber: body.PhoneNumber,
      Status: body.Status,
      UpdatedAtStr: nowSCLSql121(), // hora local America/Santiago
      UserModified: Number(userId),
    });

    if (!updated) {
      return res.status(404).json({ ok: false, message: 'Store no encontrada' });
    }

    // Mensaje claro al actualizar
    return res.json({
      ok: true,
      message: 'La tienda ha sido actualizada correctamente',
    });
  } catch (err) {
    const num =
      err?.number ??
      err?.originalError?.info?.number ??
      err?.originalError?.number ??
      err?.precedingErrors?.[0]?.number ??
      null;

    // 2627 / 2601: índice único duplicado (por ejemplo, Name único)
    if (num === 2627 || num === 2601) {
      const msg = err?.originalError?.info?.message || '';
      const isNameUnique = /UX_Store_Name/i.test(msg) || /UNIQUE.*Name/i.test(msg);
      return res.status(409).json({
        ok: false,
        code: isNameUnique ? 'UNIQUE_NAME' : 'UNIQUE_VIOLATION',
        message: isNameUnique
          ? 'Ya existe una tienda con ese Name.'
          : 'Violación de restricción única.',
      });
    }

    console.error('putStore error:', {
      message: err?.message,
      number: num,
      info: err?.originalError?.info,
    });
    return res.status(500).json({ ok: false, message: 'Error actualizando la tienda' });
  }
}



module.exports = { postStore, getStore, getStores, putStore };
