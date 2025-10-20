import { findByURef1, setError, setSent } from '../models/repository.js';
import { toOmsFormat } from './transform.js';
import { postToOms } from './oms.js';
import { emit } from './kafka.js';

// simple in-memory backoff (puedes reemplazar por BullMQ/Agenda)
export function scheduleRetry(uRef1, attempt = 1) {
  const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
  setTimeout(async () => {
    const row = await findByURef1(uRef1);
    if (!row) return;

    try {
      const mv = row._rawJson ? JSON.parse(row._rawJson) : null; // si decides guardar el JSON
      if (!mv) return; // o reconstruye desde tus tablas
      const payload = toOmsFormat(mv);
      const { orderId: omsId } = await postToOms(payload);
      await setSent(row.id, omsId);
      await emit(process.env.TOPIC_OUT_ORDER_IMPORTED, { source: 'multivende', u_ref1: payload.u_ref1, ref_omsOrderId: omsId });
    } catch (e) {
      await setError(row.id, e.message);
      if (attempt < 5) scheduleRetry(uRef1, attempt + 1);
    }
  }, delay);
}
