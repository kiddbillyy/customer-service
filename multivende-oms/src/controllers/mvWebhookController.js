// src/controllers/mvWebhookController.js
import { persistOrder, persistStatuses, persistReceipt, setSent, setError, findByURef1, saveOmsPayload } from '../models/repository.js';
import { toOmsFormat, toFinanceFormat } from '../services/transform.js';
import { postToOms } from '../services/oms.js';
import { emit } from '../services/kafka.js';
// import { scheduleRetry } from '../services/retry.js'; // ← si usas cron, ya no es necesario

export async function receiveMultivende(req, res) {
  const mv = req.body;

  try {
    // 1) Persistencia mínima
    const orderId = await persistOrder(mv);
    await persistStatuses(orderId, mv);
    await persistReceipt(orderId, mv);

    // 2) Transformación → OMS (NUEVO: también finance)
    const omsPayload = toOmsFormat(mv);
    const finPayload = toFinanceFormat(mv, { u_ref1: omsPayload.u_ref1 });

    // 2.1) Guardar el payload NUEVO para auditoría/observabilidad
    await saveOmsPayload(orderId, omsPayload);

    // 3) Envío a OMS (si tu API espera ambos, manda { order, finance })
    try {
      const { orderId: omsId } = await postToOms({ order: omsPayload, finance: finPayload });

      await setSent(orderId, omsId);
      await emit(process.env.TOPIC_OUT_ORDER_IMPORTED, {
        source: 'multivende',
        u_ref1: omsPayload.u_ref1,
        ref_omsOrderId: omsId
      });

      return res.status(202).json({ ok: true, orderId, omsId });
    } catch (e) {
      // Marcar error para que el CRON lo tome
      await setError(orderId, e.message);

      await emit(process.env.TOPIC_OUT_INTEGRATION_STATUS, {
        source: 'multivende',
        u_ref1: omsPayload.u_ref1,
        statusIntegration: 'error',
        error: e.message
      });

      // scheduleRetry(omsPayload.u_ref1); // ← si ya tienes cron, comenta/borra
      return res.status(202).json({ ok: false, orderId, error: e.message });
    }
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function retryByURef1(req, res) {
  const { uRef1 } = req.params;
  // scheduleRetry(uRef1); // ← idem, si usas cron, puedes responder 202 y listo
  res.json({ ok: true, message: 'Retry scheduled', uRef1 });
}

export async function getByURef1(req, res) {
  const { uRef1 } = req.params;
  const data = await findByURef1(uRef1);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, data });
}
