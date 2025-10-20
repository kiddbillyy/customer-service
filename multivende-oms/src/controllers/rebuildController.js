// src/controllers/rebuildController.js
import { getCheckout } from '../services/multivendeApi.js';
import { toOmsFormat } from '../services/transform.js';
import { postToOms } from '../services/oms.js';
import {
  findById,
  findByURef1,
  saveOmsPayload,
  setSent,
  setError,
} from '../models/repository.js';

function pickMVIdFromRow(row) {
  // intenta leer el id de MV desde rawData
  try {
    const raw = row?.rawData && JSON.parse(row.rawData);
    return raw?.CheckoutId || raw?._id || row?.ref_multivendeId || null;
  } catch {
    return row?.ref_multivendeId || null;
  }
}

async function rebuildAndSend(row, logPrefix = '[REBUILD]') {
  const orderId = row.id;

  const mvId = pickMVIdFromRow(row);
  if (!mvId) {
    throw new Error('No encuentro CheckoutId/MultivendeId en la orden');
  }

  // 1) Traer nuevamente desde Multivende
  const mvOrder = await getCheckout(mvId);
  if (!mvOrder) throw new Error(`Multivende devolvió 404 para ${mvId}`);

  // 2) Transformar y guardar el nuevo payload en BD
  const payload = toOmsFormat(mvOrder);
  await saveOmsPayload(orderId, payload);

  // 3) Enviar al OMS
  const resp = await postToOms(payload); // espera { orderId: ... }
  await setSent(orderId, resp.orderId);

  return { orderId, omsId: resp.orderId, payloadPreview: payload?.u_ref1 || null };
}

export async function rebuildById(req, res) {
  try {
    const { id } = req.params;
    const row = await findById(id);
    if (!row) return res.status(404).json({ ok: false, error: 'order not found' });

    const out = await rebuildAndSend(row, '[REBUILD byId]');
    return res.json({ ok: true, ...out });
  } catch (err) {
    // si hay row.id, marca error en la BD
    if (req.params?.id) {
      try { 
        const row = await findById(req.params.id);
        if (row) await setError(row.id, err.message);
      } catch {}
    }
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function rebuildByURef1(req, res) {
  try {
    const { uRef1 } = req.params;
    const row = await findByURef1(uRef1);
    if (!row) return res.status(404).json({ ok: false, error: 'order not found (uRef1)' });

    const out = await rebuildAndSend(row, '[REBUILD byURef1]');
    return res.json({ ok: true, ...out });
  } catch (err) {
    try {
      const row = await findByURef1(req.params.uRef1);
      if (row) await setError(row.id, err.message);
    } catch {}
    return res.status(500).json({ ok: false, error: err.message });
  }
}
