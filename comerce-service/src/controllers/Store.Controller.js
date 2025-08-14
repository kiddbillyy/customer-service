// controllers/Store.Controller.js
const { createStore } = require('../models/StoreModels');
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

module.exports = { postStore };
