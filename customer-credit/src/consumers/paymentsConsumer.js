// src/consumers/paymentsConsumer.js (ESM)
import { consumerPayments as consumer } from '../config/kafka.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getPool, sql } from '../config/db.js';
import * as creditService from '../services/creditService.js';

const h2s = (h) => (Buffer.isBuffer(h) ? h.toString('utf8') : (h ?? '').toString());

// --- Idempotencia usando tabla SQL dbo.ProcessedEvents(traceId, topic) ---
async function markIfFirstProcess(traceId, topic) {
  if (!traceId) return true; // si no hay trace, procesamos igual (no idempotencia)
  const pool = await getPool();
  try {
    await pool.request()
      .input('traceId', sql.NVarChar(100), traceId)
      .input('topic',   sql.NVarChar(200), topic)
      .query(`INSERT INTO dbo.ProcessedEvents(id, traceId, topic) VALUES(NEWID(), @traceId, @topic);`);
    return true;
  } catch (e) {
    const code = e?.number || e?.originalError?.info?.number;
    if (code === 2627 || code === 2601) return false; // PK/unique violation => ya procesado
    throw e;
  }
}

export async function runPaymentsConsumer() {
  // 0) Conectarse y loguear eventos útiles
  await consumer.connect();

  consumer.on(consumer.events.CONNECT,    () => logger.info('PaymentsConsumer: CONNECT'));
  consumer.on(consumer.events.DISCONNECT, () => logger.warn('PaymentsConsumer: DISCONNECT'));
  consumer.on(consumer.events.CRASH,   e  => logger.error({ err: e?.payload?.error }, 'PaymentsConsumer: CRASH'));
  consumer.on(consumer.events.GROUP_JOIN, e => {
    logger.info({
      groupId: e?.payload?.groupId,
      memberId: e?.payload?.memberId,
      // assignments visibles sólo si parseas memberAssignment; este log es orientativo
    }, 'PaymentsConsumer: GROUP_JOIN');
  });

  // 1) Suscripciones (usa EXACTAMENTE los topics del worker)
  const fromBeginning = String(env.PAYMENTS_FROM_BEGINNING ?? 'false').toLowerCase() === 'true';

  if (env.TOPIC_PAYMENT_RECEIVED) {
    await consumer.subscribe({ topic: env.TOPIC_PAYMENT_RECEIVED, fromBeginning });
  } else {
    logger.warn('PaymentsConsumer: TOPIC_PAYMENT_RECEIVED no configurado');
  }

  if (env.TOPIC_PAYMENT_APPLIED) {
    await consumer.subscribe({ topic: env.TOPIC_PAYMENT_APPLIED, fromBeginning });
  } else {
    logger.info('PaymentsConsumer: TOPIC_PAYMENT_APPLIED no configurado (opcional)');
  }

  logger.info({
    REC: env.TOPIC_PAYMENT_RECEIVED,
    APP: env.TOPIC_PAYMENT_APPLIED,
    fromBeginning
  }, 'PaymentsConsumer: subscribed');

  // 2) Loop principal
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString() ?? '';
      const headers = Object.fromEntries(
        Object.entries(message.headers ?? {}).map(([k, v]) => [k, h2s(v)])
      );
      logger.info(
        { topic, partition, offset: message.offset, headers, raw },
        'PaymentsConsumer: event received'
      );

      // 2.1) Parseo robusto
      let evt;
      try {
        evt = JSON.parse(raw);
      } catch {
        logger.error({ raw }, 'PaymentsConsumer: JSON inválido');
        return;
      }

      // 2.2) Idempotencia: traceId robusto
      const traceId =
        headers['x-trace-id'] ||
        evt.idempotencyKey ||
        evt.id ||
        evt.eventId ||
        evt.paymentId ||
        (evt.source && evt.objType != null && evt.docEntry != null
          ? `${evt.source}-${evt.objType}-${evt.docEntry}`
          : '') ||
        '';

      const first = await markIfFirstProcess(traceId, topic);
      if (!first) {
        logger.info({ topic, traceId }, 'PaymentsConsumer: duplicado ignorado');
        return;
      }

      try {
        // 2.3) Mapeo de payload del worker → shape interno de tu servicio
        // Esperado por tu creditService.handlePaymentReceived:
        // { paymentId, cardCode?, customerId?, amount, currency?, appliedAt?, onAccount?, meta? }

        // paymentId
        const paymentId =
          evt.idempotencyKey ||
          evt.paymentId ||
          (evt.source && evt.objType != null && evt.docEntry != null
            ? `${evt.source}-${evt.objType}-${evt.docEntry}`
            : undefined);

        // amount: usa amountTotal o suma amounts{cash,check,transfer,creditCard}
        const summed = evt.amounts
          ? Object.values(evt.amounts).reduce((a, b) => a + Number(b || 0), 0)
          : undefined;
        const amount = Number(evt.amount ?? evt.amountTotal ?? summed);

        const cardCode  = evt.customer?.code ?? evt.cardCode ?? evt.customerId ?? undefined;
        const currency  = evt.currency || 'CLP';
        const appliedAt = evt.emittedAt || evt.appliedAt || evt.docDate || null;
        const onAccount = !!(evt.onAccount ?? false);

        if (!paymentId) throw new Error('paymentId requerido');
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount inválido');

        const result = await creditService.handlePaymentReceived({
          paymentId,
          cardCode,
          customerId: evt.customerId, // si viene de otra fuente
          amount,
          currency,
          appliedAt,
          onAccount,
          meta: {
            source: evt.source,
            objType: evt.objType,
            docEntry: evt.docEntry,
            docNum: evt.docNum,
            topic,
          },
        });

        logger.info(
          { topic, paymentId, amount, currency, cardCode, appliedAt, onAccount, result },
          'PaymentsConsumer: payment aplicado'
        );
      } catch (err) {
        logger.error({ topic, evt, err: err.message }, 'PaymentsConsumer: error procesando evento');
      }
    },
  });
}

export async function stopPaymentsConsumer() {
  try { await consumer.disconnect(); } catch {}
}

// Ejecutar directo: node src/consumers/paymentsConsumer.js
if (process.argv[1]?.endsWith('paymentsConsumer.js')) {
  runPaymentsConsumer().catch((e) => {
    console.error('Fatal paymentsConsumer:', e);
    process.exit(1);
  });
}
