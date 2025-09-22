import { consumer } from '../config/kafka.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

import { placeHold, releaseHold, consumeHold } from '../services/holdService.js';
import * as creditService from '../services/creditService.js';

/**
 * Cache en memoria:
 * - eventIdSet: evita procesar el mismo evento dos veces (idempotencia básica)
 * - orderHoldMap: relaciona orderId/preorderId -> holdId para liberar/consumir rápido
 *   (en prod: persistir en tabla p.ej. dbo.PreorderHolds o buscar por orderId en CreditHolds)
 */
const eventIdSet = new Set();
const orderHoldMap = new Map();

function getEventId(evt) {
  // intenta varios nombres comunes de id de evento
  return evt?.id || evt?.eventId || evt?.messageId || null;
}

async function findCreditByCustomerOrCard({ customerId, cardCode }) {
  if (customerId) {
    const byId = await creditService.list({ customerId });
    if (byId?.length) return byId[0];
  }
  if (cardCode) {
    const byCode = await creditService.list({ cardCode });
    if (byCode?.length) return byCode[0];
  }
  return null;
}

export async function runOrderConsumer() {
  // Tópicos “orden” (ya definidos)
  await consumer.subscribe({ topic: env.TOPIC_ORDER_AUTHORIZED, fromBeginning: false });
  await consumer.subscribe({ topic: env.TOPIC_ORDER_CANCELLED, fromBeginning: false });
  await consumer.subscribe({ topic: env.TOPIC_ORDER_INVOICED,  fromBeginning: false });

  // Tópicos “preventa” (opcionales)
  if (env.TOPIC_PREORDER_CREATED)   await consumer.subscribe({ topic: env.TOPIC_PREORDER_CREATED,   fromBeginning: false });
  if (env.TOPIC_PREORDER_CANCELLED) await consumer.subscribe({ topic: env.TOPIC_PREORDER_CANCELLED, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      let evt;
      try {
        evt = JSON.parse(message.value.toString());
      } catch {
        logger.error({ topic }, 'Evento Kafka no es JSON válido');
        return;
      }

      const eventId = getEventId(evt);
      if (eventId && eventIdSet.has(eventId)) {
        logger.warn({ topic, eventId }, 'Evento duplicado ignorado (idempotencia)');
        return;
      }
      if (eventId) eventIdSet.add(eventId);

      try {
        switch (topic) {
          case (env.TOPIC_ORDER_AUTHORIZED): {
            // Espera: { orderId, customerId?, cardCode?, amount, currency?, expiresAt?, reason? }
            const { orderId, customerId, cardCode, amount, currency = 'CLP', expiresAt = null, reason = 'Order authorized' } = evt;
            if (!orderId || !amount) throw new Error('orderId y amount son requeridos');

            const credit = await findCreditByCustomerOrCard({ customerId, cardCode });
            if (!credit) throw new Error('Crédito no existe para el cliente');

            const hold = await placeHold(credit.id, { amount: Number(amount), orderId, expiresAt, reason });
            orderHoldMap.set(orderId, hold.id);

            logger.info({ topic, orderId, holdId: hold.id, creditId: credit.id, amount }, 'Hold creado por order.authorized');
            break;
          }

          case (env.TOPIC_ORDER_CANCELLED): {
            // Espera: { orderId }
            const { orderId } = evt;
            if (!orderId) throw new Error('orderId requerido');

            const holdId = orderHoldMap.get(orderId);
            if (holdId) {
              await releaseHold(holdId);
              orderHoldMap.delete(orderId);
              logger.info({ topic, orderId, holdId }, 'Hold liberado por order.cancelled');
            } else {
              // fallback: podrías buscar en DB por orderId
              logger.warn({ topic, orderId }, 'No se encontró holdId en cache; implementar lookup por DB si es necesario');
            }
            break;
          }

          case (env.TOPIC_ORDER_INVOICED): {
            // Espera: { orderId }
            const { orderId } = evt;
            if (!orderId) throw new Error('orderId requerido');

            const holdId = orderHoldMap.get(orderId);
            if (holdId) {
              await consumeHold(holdId); // crea charge/debit por el monto del hold
              orderHoldMap.delete(orderId);
              logger.info({ topic, orderId, holdId }, 'Hold consumido por order.invoiced (cargo generado)');
            } else {
              logger.warn({ topic, orderId }, 'No se encontró holdId en cache; implementar lookup por DB si es necesario');
            }
            break;
          }

          case (env.TOPIC_PREORDER_CREATED): {
            // Preventa: { preorderId, customerId?, cardCode?, amount, currency?, expiresAt?, reason? }
            const { preorderId, customerId, cardCode, amount, currency = 'CLP', expiresAt = null, reason = 'Preorder created' } = evt;
            if (!preorderId || !amount) throw new Error('preorderId y amount son requeridos');

            const credit = await findCreditByCustomerOrCard({ customerId, cardCode });
            if (!credit) throw new Error('Crédito no existe para el cliente');

            const hold = await placeHold(credit.id, { amount: Number(amount), orderId: preorderId, expiresAt, reason });
            orderHoldMap.set(preorderId, hold.id);

            logger.info({ topic, preorderId, holdId: hold.id, creditId: credit.id, amount }, 'Hold creado por preorder.created');
            break;
          }

          case (env.TOPIC_PREORDER_CANCELLED): {
            const { preorderId } = evt;
            if (!preorderId) throw new Error('preorderId requerido');

            const holdId = orderHoldMap.get(preorderId);
            if (holdId) {
              await releaseHold(holdId);
              orderHoldMap.delete(preorderId);
              logger.info({ topic, preorderId, holdId }, 'Hold liberado por preorder.cancelled');
            } else {
              logger.warn({ topic, preorderId }, 'No se encontró holdId en cache; implementar lookup por DB si es necesario');
            }
            break;
          }

          default:
            logger.warn({ topic }, 'Tópico no manejado');
        }
      } catch (err) {
        logger.error({ topic, evt, err: err.message }, 'Error procesando evento');
      }
    }
  });
}
