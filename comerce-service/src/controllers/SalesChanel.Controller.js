// controllers/SalesChannel.Controller.js
const { createSalesChannel } = require('../models/SalesChanelModels');
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

    const created = await createSalesChannel({
      CompanyId:        Number(body.CompanyId),
      Name:             body.Name,
      ExternalDelivery: body.ExternalDelivery ?? 0,
      IsActive:         body.IsActive ?? 1,
      CreatedAtStr:     nowSCLSql121(),
      UserCreated:      body.UserCreated ?? req.user?.usuarioId ?? null,
    });

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    const num = getSqlNumber(err);

    // 547: violación FK (CompanyId inexistente o constraint)
    if (num === 547) {
      return res.status(400).json({
        ok: false,
        code: 'FK_VIOLATION',
        message: 'CompanyId no existe o viola la restricción de la base de datos.',
      });
    }

    // 2627/2601: violación de único (por si agregas índices únicos a Name/ReferenceId)
    if (num === 2627 || num === 2601) {
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

module.exports = { postSalesChannel };
