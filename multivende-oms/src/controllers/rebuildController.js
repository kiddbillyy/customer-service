// src/controllers/rebuildController.js
import { getCheckout } from '../services/multivendeApi.js';
import { toOmsFormat, toFinanceFormat } from '../services/transform.js';
import { postToOms } from '../services/oms.js';
import { postFinancePayment } from '../services/finance.js';
import {
  setPaymentSent,
  setPaymentError,
  findById,
  findByURef1,
  saveOmsPayload,
  setSent,
  setError,
  saveFinancePayload
} from '../models/repository.js';


function pickMVIdFromRow(row) {
  try {
    const raw = row?.rawData && JSON.parse(row.rawData);
    return raw?.CheckoutId || raw?._id || row?.ref_multivendeId || null;
  } catch {
    return row?.ref_multivendeId || null;
  }
}

export async function rebuildAndSend(row, logPrefix = '[REBUILD]') {
  const orderId = row.id;

  // 1) Traer nuevamente desde Multivende
  const mvId = pickMVIdFromRow(row);
  if (!mvId) throw new Error('No encuentro CheckoutId/MultivendeId en la orden');
  const mvOrder = await getCheckout(mvId);
  if (!mvOrder) throw new Error(`Multivende devolvió 404 para ${mvId}`);

  // 2) Transformar y guardar el nuevo payload en BD
  const omsPayload = toOmsFormat(mvOrder);
  await saveOmsPayload(orderId, omsPayload);

  // 3) Enviar al OMS
  const omsResp = await postToOms(omsPayload); // { orderId: ... }
  await setSent(orderId, omsResp.orderId);

  // 4) Enviar pago a Finance (persistiendo payload y manejando errores)
  let financeOk = false;
  let financeError = null;
  try {
    const finPayload = toFinanceFormat(mvOrder, { u_ref1: omsPayload.u_ref1 });

    // 👇 guarda lo que se enviará a Finance
    await saveFinancePayload(orderId, finPayload);

    const finResp = await postFinancePayment(finPayload);
    // opcional: guarda la respuesta
    // await saveFinanceResponse(orderId, finResp);

    await setPaymentSent(orderId);
    financeOk = true;
  } catch (e) {
    financeError = e?.message || String(e);
    await setPaymentError(orderId, financeError);
  }

  return {
    orderId,
    omsId: omsResp.orderId,
    u_ref1: omsPayload?.u_ref1 || null,
    financeOk,
    ...(financeOk ? {} : { financeError }),
  };
}

export async function rebuildById(req, res) {
  try {
    const { id } = req.params;
    const row = await findById(id);
    if (!row) return res.status(404).json({ ok: false, error: 'order not found' });

    const out = await rebuildAndSend(row, '[REBUILD byId]');
    return res.json({ ok: true, ...out });
  } catch (err) {
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
