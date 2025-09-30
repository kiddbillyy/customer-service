// src/workers/outboxPublisher.js
import 'dotenv/config.js';
import { Kafka } from 'kafkajs';
import { getPool, sql } from '../config/db.js';

const POLL_MS = Number(process.env.OUTBOX_POLL_MS || 3000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE || 200);
const AUTO_TOPIC = String(process.env.OUTBOX_CREATE_TOPICS || 'false').toLowerCase() === 'true';
const TOPIC_PARTITIONS = Number(process.env.OUTBOX_TOPIC_PARTITIONS || 3);
const TOPIC_REPL_FACTOR = Number(process.env.OUTBOX_TOPIC_REP_FACTOR || 1);

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'customer-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});
const producer = kafka.producer({ allowAutoTopicCreation: false });
const admin = kafka.admin();

async function ensureTopics(topics) {
  if (!AUTO_TOPIC || topics.length === 0) return;

  try {
    await admin.connect();
    const existing = new Set(await admin.listTopics());
    const toCreate = topics
      .filter(t => t && !existing.has(t))
      .map(t => ({ topic: t, numPartitions: TOPIC_PARTITIONS, replicationFactor: TOPIC_REPL_FACTOR }));

    if (toCreate.length) {
      await admin.createTopics({ topics: toCreate, waitForLeaders: true });
      console.log(`[outboxPublisher] Topics creados: ${toCreate.map(t => t.topic).join(', ')}`);
    }
  } catch (e) {
    console.warn('[outboxPublisher] No se pudieron crear topics automáticamente:', e.message);
  } finally {
    try { await admin.disconnect(); } catch {}
  }
}

function rowsToBatches(rows) {
  const byTopic = new Map();
  for (const row of rows) {
    const evt = JSON.parse(row.payload);
    const key = evt?.payload?.customerId || evt?.payload?.cardCode || undefined;
    const msg = {
      key: key ? String(key) : undefined,
      value: row.payload,
      headers: {
        'x-trace-id': Buffer.from(String(evt?.traceId || ''), 'utf8'),
        'x-event-type': Buffer.from(String(evt?.event || ''), 'utf8'),
        'x-version': Buffer.from(String(evt?.version ?? '1'), 'utf8'),
      },
    };
    const arr = byTopic.get(row.topic) || [];
    arr.push({ id: row.id, msg });
    byTopic.set(row.topic, arr);
  }
  return byTopic;
}

async function publishOnce() {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // Bloquea de forma cooperativa el lote para evitar doble publicación (si hay más workers)
    const rs = await new sql.Request(tx).query(`
      SELECT TOP (${BATCH_SIZE}) id, topic, payload
      FROM dbo.Outbox WITH (READPAST, UPDLOCK, ROWLOCK)
      WHERE processedAt IS NULL
      ORDER BY createdAt ASC;
    `);

    const rows = rs.recordset;
    if (rows.length === 0) {
      await tx.commit();
      return 0;
    }

    const topics = [...new Set(rows.map(r => r.topic).filter(Boolean))];
    if (AUTO_TOPIC) await ensureTopics(topics);

    await producer.connect();

    // Arma mensajes por topic y publica
    const batches = rowsToBatches(rows);
    for (const [topic, items] of batches.entries()) {
      await producer.send({ topic, messages: items.map(it => it.msg) });
    }

    // Marca como procesados en la MISMA transacción
    // (Generamos parámetros @id0, @id1, ... para el IN)
    const ids = rows.map(r => r.id);
    const reqUpdate = new sql.Request(tx).input('now', sql.DateTime2, new Date());
    const placeholders = ids.map((_, i) => `@id${i}`);
    ids.forEach((id, i) => reqUpdate.input(`id${i}`, sql.UniqueIdentifier, id));

    await reqUpdate.query(`
      UPDATE dbo.Outbox
      SET processedAt = @now
      WHERE id IN (${placeholders.join(',')});
    `);

    await tx.commit();
    console.log(`[outboxPublisher] publicados=${rows.length} topics=[${topics.join(', ')}]`);
    return rows.length;
  } catch (err) {
    // Si falla el send o el update, hacemos rollback para que el lote vuelva a estar disponible
    try { await tx.rollback(); } catch {}
    console.error('[outboxPublisher] error:', err);
    return 0;
  } finally {
    // Mantén el producer conectado entre ciclos para performance,
    // pero si quieres cerrar cada ciclo, descomenta la línea siguiente:
    // try { await producer.disconnect(); } catch {}
  }
}

export async function runOutboxPublisher() {
  console.log('[outboxPublisher] iniciado. pollMs=%d batchSize=%d', POLL_MS, BATCH_SIZE);
  setInterval(async () => {
    try { await publishOnce(); } catch (e) { console.error('[outboxPublisher] loop error:', e); }
  }, POLL_MS);

  const shutdown = async () => {
    console.log('\n[outboxPublisher] shutting down...');
    try { await producer.disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Ejecutar directo: `node src/workers/outboxPublisher.js`
if (process.argv[1]?.endsWith('outboxPublisher.js')) {
  runOutboxPublisher().catch(err => {
    console.error('Fatal outboxPublisher:', err);
    process.exit(1);
  });
}
