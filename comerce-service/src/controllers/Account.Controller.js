// controllers/Account.Controller.js
const { createAccount, getAccountById, listAccounts, updateAccountById, createAccountsBulk, getAccountFeaturesById } = require('../models/AccountModels');
const { nowSCLSql121 } = require('../utils/dates'); // debe devolver "yyyy-MM-dd HH:mm:ss.SSS" en America/Santiago

function getSqlNumber(err) {
  return (
    err?.number ??
    err?.originalError?.info?.number ??
    err?.originalError?.number ??
    err?.precedingErrors?.[0]?.number ??
    null
  );
}

async function postAccount(req, res) {
  try {
    const b = req.body || {};

    if (!b.SalesChannelId) return res.status(400).json({ ok: false, message: 'SalesChannelId es obligatorio' });
    if (!b.Name)           return res.status(400).json({ ok: false, message: 'Name es obligatorio' });
    if (!b.Platform)       return res.status(400).json({ ok: false, message: 'Platform es obligatorio' });

    // Normaliza Features: permite enviar objeto y lo guardamos como JSON string
    let featuresStr = null;
    if (b.Features !== undefined && b.Features !== null) {
      if (typeof b.Features === 'string') {
        featuresStr = b.Features;
      } else {
        try { featuresStr = JSON.stringify(b.Features); }
        catch { return res.status(400).json({ ok:false, message:'Features debe ser JSON válido' }); }
      }
    }

    const created = await createAccount({
      SalesChannelId: Number(b.SalesChannelId),
      Name:           b.Name,
      Platform:       b.Platform,
      EcommerceName:  b.EcommerceName ?? null,
      Features:       featuresStr,
      Status:         b.Status ?? 1,
      DateCreatedStr: nowSCLSql121(),
      UserCreated:    b.UserCreated ?? req.user?.usuarioId ?? null,
    });

    return res.status(201).json({ ok: true, message: 'Cuenta creada exitosamente', data: created });
  } catch (err) {
    const num = getSqlNumber(err);
    const msg = err?.originalError?.info?.message || err?.message || '';

    // 547: FK inválida (SalesChannelId no existe)
    if (num === 547) {
      return res.status(400).json({
        ok: false,
        code: 'FK_VIOLATION',
        message: 'SalesChannelId no existe o viola la restricción de la base de datos.',
      });
    }

    // 2627 / 2601: UNIQUE (por ejemplo, ReferenceId duplicado)
    if (num === 2627 || num === 2601) {
      const isRef = /ReferenceId/i.test(msg);
      return res.status(409).json({
        ok: false,
        code: isRef ? 'UNIQUE_REFERENCEID' : 'UNIQUE_VIOLATION',
        message: isRef
          ? 'ReferenceId duplicado.'
          : 'Violación de restricción única.',
      });
    }

    console.error('postAccount error:', { number: num, msg, err });
    return res.status(500).json({ ok: false, message: 'Error creando la cuenta' });
  }
}

async function getAccount(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, message: 'Id inválido' });
    }

    const account = await getAccountById(id);
    if (!account) {
      return res.status(404).json({ ok: false, message: 'Account no encontrada' });
    }

    return res.json({ ok: true, data: account });
  } catch (err) {
    console.error('getAccount error:', err);
    return res.status(500).json({ ok: false, message: 'Error obteniendo account' });
  }
}
const parseIntOr = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
};

async function getList(req, res) {
  try {
    const page = parseIntOr(req.query.page, 1);
    const pageSize = parseIntOr(req.query.pageSize, 10);

    const filters = {
      name:             req.query.name || undefined,
      platform:         req.query.platform || undefined,
      ecommerceName:    req.query.ecommerceName || undefined,
      salesChannelName: req.query.salesChannelName || undefined,
      status:           req.query.status ?? undefined, // 0/1 opcional
    };

    const result = await listAccounts({ page, pageSize, filters });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('getAccounts error:', err);
    return res.status(500).json({ ok: false, message: 'Error obteniendo accounts' });
  }
}
async function putAccount(req, res) {
  try {
    const accountId = parseInt(req.params.id, 10);
    if (Number.isNaN(accountId)) {
      return res.status(400).json({ ok: false, message: 'Id inválido' });
    }

    const body = req.body || {};
    const userId =
      body.UserModified ??
      body.UserCreated ??
      req.user?.usuarioId ??
      null;

    if (userId === null) {
      return res.status(400).json({ ok: false, message: 'UserModified es obligatorio' });
    }

    const updated = await updateAccountById(accountId, {
      Name:          body.Name,
      Platform:      body.Platform,
      EcommerceName: body.EcommerceName,
      Features:      body.Features ? JSON.stringify(body.Features) : null,
      Status:        body.Status,
      DateModifiedStr: nowSCLSql121(),
      UserModified:  Number(userId),
    });

    if (!updated) {
      return res.status(404).json({ ok: false, message: 'Account no encontrada' });
    }

    return res.json({ ok: true, message: 'Account actualizada correctamente', data: updated });
  } catch (err) {
    const num = err?.number ?? err?.originalError?.info?.number ?? null;

    if (num === 2627 || num === 2601) {
      return res.status(409).json({
        ok: false,
        code: 'UNIQUE_VIOLATION',
        message: 'Ya existe un registro con ese ReferenceId o Name.',
      });
    }

    console.error('putAccount error:', err);
    return res.status(500).json({ ok: false, message: 'Error actualizando el account' });
  }
}

function toFeaturesString(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val); } catch { return null; }
}

async function postAccountsBulk(req, res) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ ok: false, message: 'Debes enviar un arreglo "items" con accounts.' });
    }

    // Validación y normalización rápida por item
    const prepared = [];
    const preErrors = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      if (!it.SalesChannelId || !it.Name || !it.Platform) {
        preErrors.push({
          index: i,
          SalesChannelId: it.SalesChannelId ?? null,
          Name: it.Name ?? null,
          code: 'VALIDATION_ERROR',
          message: 'SalesChannelId, Name y Platform son obligatorios'
        });
        continue;
      }
      prepared.push({
        SalesChannelId: Number(it.SalesChannelId),
        Name: String(it.Name).trim(),
        Platform: String(it.Platform).trim(),
        EcommerceName: it.EcommerceName ?? null,
        Features: toFeaturesString(it.Features),
        Status: it.Status ?? 1,
        DateCreatedStr: nowSCLSql121(),
        UserCreated: it.UserCreated ?? req.user?.usuarioId ?? null,
      });
    }

    // Si todo falló en validación previa
    if (prepared.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'Ningún item válido para crear.',
        summary: { total: items.length, inserted: 0, failed: preErrors.length },
        errors: preErrors
      });
    }

    const { inserted, errors } = await createAccountsBulk(prepared);
    const allErrors = [...preErrors, ...errors];

    if (inserted.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'Ningún account fue creado.',
        summary: { total: items.length, inserted: 0, failed: allErrors.length },
        errors: allErrors
      });
    }

    if (allErrors.length === 0) {
      return res.status(201).json({
        ok: true,
        message: `${inserted.length} accounts creados correctamente.`,
        summary: { total: items.length, inserted: inserted.length, failed: 0 },
        data: inserted
      });
    }

    // Parcialmente exitoso
    return res.status(207).json({
      ok: true,
      message: `${inserted.length} creados, ${allErrors.length} con error.`,
      summary: { total: items.length, inserted: inserted.length, failed: allErrors.length },
      data: inserted,
      errors: allErrors
    });
  } catch (err) {
    console.error('postAccountsBulk error:', err);
    return res.status(500).json({ ok: false, message: 'Error creando accounts masivos' });
  }
}
async function getAccountFeatures(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, message: 'Id inválido' });
    }

    const row = await getAccountFeaturesById(id);
    if (!row) {
      return res.status(404).json({ ok: false, message: 'Account no encontrada' });
    }

    // ¿Necesitas el raw? usa query ?raw=1
    const wantRaw = String(req.query.raw || '').trim() === '1';

    // Parseo seguro del JSON
    let featuresObj = {};
    if (row.Features && !wantRaw) {
      try {
        featuresObj = JSON.parse(row.Features);
      } catch {
        // Si está corrupto, lo devolvemos como string y avisamos
        return res.status(200).json({
          ok: true,
          warning: 'Features no es un JSON válido; se devuelve como texto.',
          data: {
            features: row.Features
          }
        });
      }
    }

    // Respuesta
    return res.json({
      ok: true,
      data: {
        features: wantRaw ? row.Features : featuresObj, 
        isJson: wantRaw ? false : true
      }
    });
  } catch (err) {
    console.error('getAccountFeatures error:', err);
    return res.status(500).json({ ok: false, message: 'Error obteniendo configuraciones del account' });
  }
}

module.exports = { postAccount, getAccount, getList, putAccount, postAccountsBulk, getAccountFeatures  };
