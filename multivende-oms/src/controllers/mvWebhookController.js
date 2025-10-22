//import { persistOrder, persistStatuses, persistReceipt, setSent, setError } from '../models/repository.js';
//import { saveOmsPayload } from '../models/repository.js'; // asegúrate que esté importado
import { toOmsFormat, toFinanceFormat } from '../services/transform.js';
import { postToOms } from '../services/oms.js';
import { postFinancePayment } from '../services/finance.js';
import { emit } from '../services/kafka.js';
import { scheduleRetry } from '../services/retry.js';
import { getCheckout } from '../services/multivendeApi.js';
//import { findByURef1 } from '../models/repository.js';
import {
  persistOrder, persistStatuses, persistReceipt, saveOmsPayload,
  saveFinancePayload, setSent, setError, setPaymentSent, setPaymentError
} from '../models/repository.js';

function isHydrated(mv) {
  // ajusta la condición a lo que consideres “suficiente”
  return Array.isArray(mv?.CheckoutItems) && mv.CheckoutItems.length > 0;
}

async function enrichFromMV(mv) {
  const mvId = mv?.CheckoutId || mv?._id;
  if (!mvId) return mv;
  try {
    const full = await getCheckout(mvId);
    return full || mv;
  } catch {
    return mv;
  }
}

export async function receiveMultivende(req, res) {
  const mv = req.body;

  try {
    // 1) Persistencia mínima
    const orderId = await persistOrder(mv);
    await persistStatuses(orderId, mv);
    await persistReceipt(orderId, mv);

    // 2) (Opcional) Hidratar desde Multivende
    let mvFull = mv;
    if (process.env.MV_FETCH_DETAILS === 'true') {
      mvFull = await enrichFromMV(mv);
    }

    // 3) Validación: si no está hidratado, NO transformes ni envíes.
    if (!isHydrated(mvFull)) {
      const uRefProbe = mv?.CheckoutLinks?.[0]?.externalOrderNumber || mv?.code || null;
      await setError(orderId, 'MV data incompleta (sin CheckoutItems). Se agenda retry.');
      scheduleRetry(uRefProbe);
      return res.status(202).json({ ok: false, orderId, reason: 'incomplete-mv', retry: true });
    }

    // 4) Transformar → OMS
    const payload = toOmsFormat(mvFull);

    // 5) Validar payload antes de persistir/enviar
    const hasURef1 = !!payload?.u_ref1;
    const hasItems = Array.isArray(payload?.items) && payload.items.length > 0;
    if (!hasURef1 || !hasItems) {
      await setError(orderId, 'Payload OMS incompleto (falta u_ref1 o items). Retry agendado.');
      scheduleRetry(payload?.u_ref1 || mv?.code || null);
      return res.status(202).json({ ok: false, orderId, reason: 'incomplete-payload', retry: true });
    }

    // 6) Guardar payload válido (ahora sí)
    await saveOmsPayload(orderId, payload);

    // 7) Enviar al OMS
    const { orderId: omsId } = await postToOms(payload);
    await setSent(orderId, omsId);

    // (Opcional) Emitir evento
    await emit?.(process.env.TOPIC_OUT_ORDER_IMPORTED, {
      source: 'multivende',
      u_ref1: payload.u_ref1,
      ref_omsOrderId: omsId
    });

    // 8) Finance (si aplica en webhook directo)
    try {
      const finPayload = toFinanceFormat(mvFull, { u_ref1: payload.u_ref1 });
      await saveFinancePayload(orderId, finPayload); // 👈 Guarda lo que envías
      await postFinancePayment(finPayload);          // 👈 Envía a Finance
      await setPaymentSent(orderId);                 // 👈 Marca OK
    } catch (e) {
      await setPaymentError(orderId, e.message || String(e)); // 👈 Marca error
      req.log?.warn({ err: e.message }, '[WEBHOOK] Finance falló (no bloqueante)');
    }

    return res.status(202).json({ ok: true, orderId, omsId });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
export async function getByURef1(req, res) {
  try {
    const { uRef1 } = req.params;
    const data = await findByURef1(uRef1);
    if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function retryByURef1(req, res) {
  const { uRef1 } = req.params;
  if (!uRef1) return res.status(400).json({ ok: false, error: 'uRef1 requerido' });

  try {
    scheduleRetry(uRef1); // tu backoff/reintento
    return res.json({ ok: true, message: 'Retry scheduled', uRef1 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
