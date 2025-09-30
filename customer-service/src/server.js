// src/server.js (ESM)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';

import customers from './routes/customers.js';
import masterdata from './routes/masterdata.js';
import { getPool } from './config/db.js';

import {
  initKafkaProducer,
  stopKafkaProducer,
  kafkaHealth, // exportado por tu producer
} from './producer/producer.js';

import {
  startSapPriceListSyncConsumer,
  stopSapPriceListSyncConsumer,
  sapPriceListSyncHealth, // exportado por tu consumer
} from './consumer/sapPriceListSyncConsumer.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---- Middleware para requestId (antes de las rutas) ----
app.use((req, _res, next) => {
  req.id = String(req.headers['x-request-id'] ?? randomUUID());
  next();
});

// ---------- Health endpoints ----------
app.get('/healthz', (_req, res) => {
  // Liveness básico: proceso vivo
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/readyz', async (_req, res) => {
  // Readiness: DB + Kafka + Consumer
  const kafka    = kafkaHealth?.() ?? null;
  const consumer = sapPriceListSyncHealth?.() ?? null;
  const health   = { db: false, kafka, consumer };

  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok;');
    health.db = true;
  } catch {
    health.db = false;
  }

  // Tu consumer health expone: consumerConnected, producerConnected, running
  const consumerOk = consumer
    ? ((consumer.consumerConnected && consumer.producerConnected) || consumer.running)
    : true; // si no hay health, no bloquea readiness

  const allOk =
    health.db === true &&
    !!health.kafka?.connected &&
    consumerOk;

  res
    .status(allOk ? 200 : 503)
    .json({ status: allOk ? 'ready' : 'not-ready', ...health });
});

// ---------- Rutas ----------
app.use('/customers', customers);
app.use('/masterdata', masterdata);

// ---------- Manejo de errores ----------
app.use((err, _req, res, _next) => {
  console.error('[ERR]', err);
  if (err?.issues) {
    return res.status(400).json({ error: 'VALIDATION_FAILED', details: err.issues });
  }
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

const PORT = Number(process.env.PORT || 5008);
let server;

// ---------- Secuencia de arranque segura ----------
async function start() {
  try {
    // 1) Probar DB temprano (opcional)
    try {
      const pool = await getPool();
      await pool.request().query('SELECT 1 AS ok;');
      console.log('[DB] OK');
    } catch (e) {
      console.warn('[DB] no disponible al arranque:', e?.message);
      // no aborta; /readyz reflejará el estado
    }

    // 2) Kafka Producer + Consumer antes de aceptar tráfico
    try {
      await initKafkaProducer();
      await startSapPriceListSyncConsumer();
    } catch (e) {
      console.error('[Kafka] no se pudo iniciar:', e?.message);
      // seguimos levantando el server; /readyz retornará 503
    }

    // 3) Escuchar
    server = app.listen(PORT, () => {
      console.log(`Customer Service listening on :${PORT}`);
    });
  } catch (e) {
    console.error('[BOOT] falla crítica:', e);
    process.exit(1);
  }
}

start();

// ---------- Cierre elegante ----------
async function shutdown(signal = 'SIGTERM') {
  console.log(`\nShutting down on ${signal}...`);
  const closeServer = new Promise((resolve) => {
    if (!server) return resolve();
    server.close(resolve);
    // fuerza cierre en 8s si quedan sockets colgando
    setTimeout(resolve, 8000).unref();
  });

  try { await stopSapPriceListSyncConsumer(); } catch (e) { console.error('[STOP] consumer:', e?.message); }
  try { await stopKafkaProducer(); } catch (e) { console.error('[STOP] producer:', e?.message); }
  try { await closeServer; } catch {}

  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (r) => {
  console.error('[unhandledRejection]', r);
});
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e);
  // opcional: process.exit(1) si prefieres no continuar
});
