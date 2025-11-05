import { wasRecentlySeen } from '../utils/idempotency.js';
import { processOrderResource } from '../services/orderProcessor.js';

export async function webhookHandler(req, res) {
  res.status(200).end();


  // ⬇️ LOG: imprime lo que llega al webhook
  console.log('[ML][WEBHOOK][IN]', {
    fwd: req.headers['x-forwarded-for'],
    ua: req.headers['user-agent'],
    body: req.body
  });

  
  try {
    const { topic, resource, user_id } = req.body || {};
    if (!topic || !resource) return;
    //if (topic !== 'orders_v2' && topic !== 'marketplace_orders') return;

    const key = `${topic}:${resource}`;
    if (wasRecentlySeen(key)) return;

    setImmediate(async () => {
      try {
        const r = await processOrderResource({ user_id, resource });
        console.log(r)
        console.log('[ML] Orden procesada:', r.id, r.status, 'isFull:', r.isFull, r.logisticType);
      } catch (err) {
        console.error('[ML] Error procesando orden:', err?.response?.data || err.message);
      }
    });
  } catch (e) {
    console.error('[ML] Error webhook:', e?.response?.data || e.message);
  }
}
