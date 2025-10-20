// src/consumers/customerEventsConsumer.js
// ESM
import 'dotenv/config.js';
import { consumerCustomers as consumer } from '../config/kafka.js';
import { env } from '../config/env.js';
import { getPool, sql } from '../config/db.js';
import * as creditService from '../services/creditService.js';

// -----------------------------
// Helpers
// -----------------------------
function headerToString(h) {
  if (!h) return '';
  try { return Buffer.isBuffer(h) ? h.toString('utf8') : String(h); }
  catch { return ''; }
}

/** Idempotencia en BD: UNIQUE(traceId, topic). Devuelve true si es 1ª vez. */
async function markIfFirstProcess(traceId, topic) {
  if (!traceId) return true; // si no viene traceId, procesa (dev)
  const pool = await getPool();
  try {
    await pool.request()
      .input('traceId', sql.NVarChar(100), traceId)
      .input('topic',   sql.NVarChar(200), topic)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.ProcessedEvents WITH (HOLDLOCK, UPDLOCK)
          WHERE traceId = @traceId AND topic = @topic
        )
        BEGIN
          INSERT INTO dbo.ProcessedEvents(traceId, topic) VALUES(@traceId, @topic);
        END
      `);
    return true;
  } catch (e) {
    const code = e?.number || e?.originalError?.info?.number;
    if (code === 2627 || code === 2601) return false; // duplicado
    throw e;
  }
}

// -----------------------------
// Consumer
// -----------------------------
export async function runCustomerConsumer() {
  // Logs de arranque/suscripción
  console.log('[customerEventsConsumer] subscribing to:',
    env.TOPIC_CUSTOMER_CREATED,
    env.TOPIC_CUSTOMER_UPDATED,
    env.KAFKA_TOPIC_CUSTOMER_CREDIT_UPSERT
  );

  await consumer.subscribe({ topic: env.TOPIC_CUSTOMER_CREATED,        fromBeginning: false });
  await consumer.subscribe({ topic: env.TOPIC_CUSTOMER_UPDATED,        fromBeginning: false });
  await consumer.subscribe({ topic: env.KAFKA_TOPIC_CUSTOMER_CREDIT_UPSERT, fromBeginning: false });
  

  console.log('[customerEventsConsumer] subscribed, running…');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      // Log crudo de todo lo que llega
      const raw = message.value?.toString('utf8') ?? '';
      const headers = Object.fromEntries(
        Object.entries(message.headers ?? {}).map(([k, v]) => [k, headerToString(v)])
      );

      console.log('[customerEventsConsumer] received:', {
        topic, partition, offset: message.offset, headers, raw
      });

      // Parseo seguro
      let evt;
      try {
        evt = JSON.parse(raw || '{}');
      } catch {
        console.error('[customerEventsConsumer] JSON inválido:', raw);
        return;
      }

      // Trazabilidad / idempotencia
      const traceId =
        headers['x-trace-id'] ||
        evt?.traceId ||
        evt?.eventId ||
        evt?.id ||
        evt?.customerId ||
        evt?.cardCode ||
        '';

      // Si ya se procesó, salir
      const first = await markIfFirstProcess(traceId, topic);
      if (!first) {
        console.log('[customerEventsConsumer] duplicate ignored:', { topic, traceId });
        return;
      }

      // Despacho por tópico
      try {
        if (topic === env.TOPIC_CUSTOMER_CREATED) {
          await creditService.handleCustomerCreated(evt);
          console.log('[customerEventsConsumer] handled customer.created');
          return;
        }

        if (topic === env.TOPIC_CUSTOMER_UPDATED) {
          await creditService.handleCustomerUpdated(evt);
          console.log('[customerEventsConsumer] handled customer.updated');
          return;
        }

        if (topic === env.KAFKA_TOPIC_CUSTOMER_CREDIT_UPSERT) {
          // soporta outbox estándar: { event, version, ts, traceId, payload:{...} }
          await creditService.handleCustomerCreditUpsert(evt);
          console.log('[customerEventsConsumer] handled customer.credit.upsert');
          return;
        }

        if (topic === env.TOPIC_PAYMENT_RECEIVED /* 'Payment.Received' */) {
  // Normalización SAP B1 -> handlePaymentReceived
  const payment = {
    paymentId: evt.idempotencyKey || String(evt.docEntry || evt.docNum),
    cardCode:   evt.customer?.code,
    amount:     Number(evt.amountTotal ?? (
                   Number(evt.amounts?.cash || 0) +
                   Number(evt.amounts?.check || 0) +
                   Number(evt.amounts?.transfer || 0) +
                   Number(evt.amounts?.creditCard || 0)
                 )),
    currency:   evt.currency || 'CLP',
    appliedAt:  evt.emittedAt || null, // ISO completo; evita usar docDate si tu Zod pide datetime
    // opcionales por si quieres auditar:
    source:     evt.source,            // 'SAPB1'
    docType:    evt.objType,           // 24
    docEntry:   evt.docEntry,          // 1668140
    docNum:     evt.docNum,            // 3355168
    onAccount:  evt.onAccount === 1,   // true/false
  };

  // idempotencia (traceId): usa idempotencyKey si viene
  const traceId = (message.headers?.['x-trace-id']?.toString?.() ?? '') || payment.paymentId;
  const first = await markIfFirstProcess(traceId, topic);
  if (!first) { logger.info({ topic, traceId }, 'Duplicado ignorado'); return; }

  // aplica el pago
  const result = await creditService.handlePaymentReceived(payment);
  logger.info({ topic, paymentId: payment.paymentId, ...result }, 'Payment aplicado (SAPB1)');
  return;
}

        console.warn('[customerEventsConsumer] tópico no manejado:', topic);
      } catch (err) {
        console.error('[customerEventsConsumer] handler error:', {
          topic, errMsg: err?.message, stack: err?.stack
        });
        // TODO: enviar a DLQ si tienes un tópico de fallos
      }
    }
  });
}

// Ejecutar directo: `node src/consumers/customerEventsConsumer.js`
if (process.argv[1]?.endsWith('customerEventsConsumer.js')) {
  runCustomerConsumer().catch((e) => {
    console.error('Fatal consumer:', e);
    process.exit(1);
  });
}
