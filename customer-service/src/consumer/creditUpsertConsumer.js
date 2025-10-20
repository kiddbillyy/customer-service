// ESM
import 'dotenv/config.js';
import { Kafka } from 'kafkajs';
import { getPool, sql } from '../config/db.js';
import { upsertCredit } from '../services/creditService.js';

const TOPIC = process.env.CREDIT_TOPIC || 'customer.credit.upsert.v1';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'customer-credit',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || 'customer-credit-consumer',
});

/** Convierte header (Buffer|undefined) a string UTF-8 segura */
function headerToString(h) {
  if (!h) return '';
  try {
    return Buffer.isBuffer(h) ? h.toString('utf8') : String(h);
  } catch {
    return '';
  }
}

export async function runCreditConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  console.log(`[creditUpsertConsumer] Subscrito a ${TOPIC}`);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        // Parseo del evento
        const raw = message.value?.toString('utf8') ?? '{}';
        const evt = JSON.parse(raw);

        const headers = message.headers || {};
        const traceId = headerToString(headers['x-trace-id']) || evt?.traceId || '';
        const eventType = headerToString(headers['x-event-type']) || evt?.event || '';
        const version = headerToString(headers['x-version']) || String(evt?.version ?? '1');

        if (eventType && eventType !== 'customer.credit.upsert') {
          // otro tipo de evento en el mismo tópico (si compartes), lo ignoramos
          return;
        }

        const payload = evt?.payload;
        if (!payload || typeof payload !== 'object') {
          console.warn('[creditUpsertConsumer] payload inválido, se ignora');
          return;
        }

        // 1) Upsert del crédito (idempotente)
        await upsertCredit(payload);

        // 2) Registrar idempotencia (UNIQUE(traceId, topic) en DB)
        const pool = await getPool();
        try {
          await pool.request()
            .input('traceId', sql.NVarChar(100), traceId)
            .input('topic', sql.NVarChar(200), topic)
            .input('eventType', sql.NVarChar(100), eventType || 'customer.credit.upsert')
            .input('version', sql.NVarChar(10), version)
            .query(`
              IF NOT EXISTS (
                SELECT 1 FROM dbo.ProcessedEvents WITH (HOLDLOCK, UPDLOCK)
                WHERE traceId = @traceId AND topic = @topic
              )
              BEGIN
                INSERT INTO dbo.ProcessedEvents(traceId, topic) VALUES(@traceId, @topic);
              END
            `);
        } catch (e) {
          // Si hay colisión única (2627/2601), ya se procesó antes → ignorar
          const code = e?.number || e?.originalError?.info?.number;
          if (code !== 2627 && code !== 2601) throw e;
        }
      } catch (err) {
        console.error('[creditUpsertConsumer] error procesando mensaje:', err);
        // Aquí podrías enviar a un DLQ (otro tópico) si lo tienes configurado.
        // No hacemos throw para no bloquear todo el grupo; deja que Kafka reintente si aplica.
      }
    },
  });
}

// Ejecutar directo: `node src/consumers/creditUpsertConsumer.js`
if (process.argv[1]?.endsWith('creditUpsertConsumer.js')) {
  runCreditConsumer().catch((e) => {
    console.error('Fatal consumer:', e);
    process.exit(1);
  });
}
