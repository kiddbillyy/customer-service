//import { consumer } from '../config/kafka.js';
import { consumerOrders as consumer } from '../config/kafka.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getPool, sql } from '../config/db.js';
import { placeHold, releaseHold, consumeHold } from '../services/holdService.js';
import * as creditService from '../services/creditService.js';

function headerToString(h) {
  if (!h) return '';
  try { return Buffer.isBuffer(h) ? h.toString('utf8') : String(h); }
  catch { return ''; }
}

export async function runOrderConsumer() {
  logger.info({                                   // 👀 LOG
    AUTH: env.TOPIC_ORDER_AUTHORIZED,
    CANC: env.TOPIC_ORDER_CANCELLED,
    INV : env.TOPIC_ORDER_INVOICED,
    PRE_C: env.TOPIC_PREORDER_CREATED,
    PRE_X: env.TOPIC_PREORDER_CANCELLED
  }, 'OrderConsumer: subscribing');

  await consumer.subscribe({ topic: env.TOPIC_ORDER_AUTHORIZED, fromBeginning: false });
  await consumer.subscribe({ topic: env.TOPIC_ORDER_CANCELLED,  fromBeginning: false });
  await consumer.subscribe({ topic: env.TOPIC_ORDER_INVOICED,   fromBeginning: false });
  if (env.TOPIC_PREORDER_CREATED)   await consumer.subscribe({ topic: env.TOPIC_PREORDER_CREATED,   fromBeginning: false });
  if (env.TOPIC_PREORDER_CANCELLED) await consumer.subscribe({ topic: env.TOPIC_PREORDER_CANCELLED, fromBeginning: false });

  logger.info('OrderConsumer: subscribed, running…');            // 👀 LOG

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString() ?? '';
      const headers = Object.fromEntries(Object.entries(message.headers ?? {}).map(([k,v])=>[k, headerToString(v)]));

      logger.info({
  topic, partition, offset: message.offset,
  raw: message.value?.toString()
}, 'Kafka event received');

      let evt;
      try {
        evt = JSON.parse(raw);
      } catch {
        logger.error({ topic, raw }, 'OrderConsumer: JSON inválido'); // 👀 LOG
        return;
      }

      try {
        switch (topic) {
          case env.TOPIC_ORDER_AUTHORIZED: {
            const { orderId, cardCode, customerId, amount, expiresAt = null, reason = 'order.authorized' } = evt;
            if (!orderId || !amount) throw new Error('orderId y amount requeridos');

            const credit = await (async () => {
              if (cardCode) {
                const list = await creditService.list({ cardCode });
                if (list?.length) return list[0];
              }
              if (customerId) {
                const list = await creditService.list({ customerId });
                if (list?.length) return list[0];
              }
              return null;
            })();

            if (!credit) {                                     // 👀 LOG
              logger.warn({ orderId, cardCode, customerId }, 'No se encontró crédito para el cliente');
              return;
            }

            const hold = await placeHold(credit.id, { amount: Number(amount), orderId, expiresAt, reason });
            logger.info({ orderId, holdId: hold.id, creditId: credit.id, amount }, 'Hold creado');

            // (opcional) mapping orderId -> holdId si creaste dbo.OrderHolds
            // const pool = await getPool();
            // await pool.request()
            //   .input('orderId', sql.NVarChar(60), orderId)
            //   .input('holdId', sql.UniqueIdentifier, hold.id)
            //   .input('creditId', sql.UniqueIdentifier, credit.id)
            //   .query(`MERGE dbo.OrderHolds AS t
            //           USING (SELECT @orderId AS orderId) AS s
            //           ON (t.orderId = s.orderId)
            //           WHEN NOT MATCHED THEN
            //             INSERT(orderId, holdId, creditId) VALUES(@orderId, @holdId, @creditId);`);
            break;
          }

          case env.TOPIC_ORDER_CANCELLED: {
            const { orderId } = evt;
            if (!orderId) throw new Error('orderId requerido');
            logger.info({ orderId }, 'OrderConsumer: cancel received'); // 👀 LOG
            // (si tienes mapping, búscalo y libera)
            break;
          }

          case env.TOPIC_ORDER_INVOICED: {
            const { orderId } = evt;
            if (!orderId) throw new Error('orderId requerido');
            logger.info({ orderId }, 'OrderConsumer: invoiced received'); // 👀 LOG
            // (si tienes mapping, búscalo y consume)
            break;
          }

          default:
            logger.warn({ topic }, 'OrderConsumer: tópico no manejado'); // 👀 LOG
        }
      } catch (err) {
        logger.error({ topic, evt, err: err.message }, 'OrderConsumer: error procesando evento'); // 👀 LOG
      }
    }
  });
}
