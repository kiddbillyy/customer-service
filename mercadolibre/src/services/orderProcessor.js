// src/services/orderProcessor.js
import { env } from '../config/env.js';
import { upsertMlOrderRow } from '../models/ordersModel.js';
import { fetchOrderById, fetchShipmentById, extractId } from './meliApi.js';
import { buildOmsPayloadMimbral, sendOrderToOms, buildIdempotencyKey } from './omsApi.js';

const SEND_ONLY_FULL = String(process.env.SEND_ONLY_FULL || 'true').toLowerCase() === 'true';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getAccessTokenFor(/* user_id */) {
  if (!env.MELI_ACCESS_TOKEN) throw new Error('No hay MELI_ACCESS_TOKEN configurado');
  return env.MELI_ACCESS_TOKEN;
}

/** Lee shipment con reintentos (porque a veces aparece segundos después de la orden) */
async function getShipmentWithRetry(
  shipmentId,
  token,
  { attempts = 5, baseDelayMs = 800, maxDelayMs = 5000 } = {}
) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchShipmentById(shipmentId, token);
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      // 404/409/422: aún no está listo el envío → reintentar
      if ([404, 409, 422].includes(status) || !status) {
        const delay = Math.min(baseDelayMs * 2 ** i, maxDelayMs);
        console.warn(`[ML] shipment ${shipmentId} no disponible (status ${status || 'N/A'}). Retry en ${delay}ms`);
        await sleep(delay);
        continue;
      }
      // otros errores (401/403/5xx) → cortar
      break;
    }
  }
  throw lastErr || new Error('No se pudo obtener shipment');
}

export async function processOrderResource({ user_id, resource }) {
  const token = await getAccessTokenFor(user_id);
  const orderId = extractId(resource, 'orders');
  if (!orderId) throw new Error(`Resource no es orden válida: ${resource}`);

  // 1) /orders
  const order = await fetchOrderById(orderId, token);

  // 2) /shipments para decidir si es FULL y para completar dirección/teléfono
  const shipmentId = order?.shipping?.id ?? null;
  let logisticType = null;
  let isFull = null;
  let shipment = null;

  if (shipmentId) {
    try {
      shipment = await getShipmentWithRetry(shipmentId, token);
      logisticType = shipment?.logistic_type ?? null;
      isFull = logisticType === 'fulfillment';
    } catch (e) {
      console.warn('[ML] No se pudo leer shipment aún:', e?.response?.status || e.message);
      isFull = null; // indeterminado
    }
  } else {
    isFull = false; // sin envío => no FULL
  }

  // 3) Persistencia local (solo FULL, como definiste)
  if (isFull === true) {
    await upsertMlOrderRow({ order, logisticType, isFull, shipmentId });
    console.log('[ML][SAVE] FULL order registrada:', order.id, order.status, logisticType);
  } else {
    console.log('[ML][SKIP] Orden NO FULL o indeterminada:', order.id, logisticType);
  }

  // 4) Envío a OMS (según política)
  if (!SEND_ONLY_FULL || isFull === true) {
    const idempotencyKey = buildIdempotencyKey(order.id);
    const payload = buildOmsPayloadMimbral(order, shipment); // ← pasa shipment “a mano”

    // (Opcional) imprime payload al OMS si estás en debug
    if ((process.env.LOG_LEVEL || '').toLowerCase() === 'debug') {
      console.log('[OMS][OUT][PAYLOAD]', JSON.stringify(payload, null, 2), { idempotencyKey });
    }

    try {
      const resp = await sendOrderToOms(payload, { idempotencyKey });
      console.log('[OMS][OK]', { orderId: order.id, idempotencyKey, result: resp?.result || 'accepted' });
    } catch (err) {
      const s = err?.response?.status;
      if (s === 409) {
        console.log('[OMS][ALREADY_EXISTS]', { orderId: order.id, idempotencyKey });
      } else {
        console.error('[OMS][ERROR]', {
          orderId: order.id,
          idempotencyKey,
          status: s,
          message: err?.message,
          apiError: err?.response?.data
        });
      }
    }
  }

  return { id: order.id, status: order.status, isFull, logisticType, shipmentId, order };
}
