// src/server.js
import 'dotenv/config';
import express from 'express';
import pinoHttp from 'pino-http';
import webhooks from './routes/webhooks.js';
import { initKafka, shutdownKafka } from './services/kafka.js';
import { connectPool, closePool } from './db/connection.js';
import { startTokenRefresher } from './services/tokenRefresher.js'; // 👈
import oauthRoutes from './routes/oauth.js'; 
import { startRetryWorker, stopRetryWorker } from './workers/retryWorker.js';
import { startInventoryConsumer } from './consumers/inventoryConsumer.js';
import { repairAuthRow } from './services/multivendeApi.js';
import rebuildRoutes from './routes/rebuild.js';
const app = express();
app.set('trust proxy', true);

app.use(
  pinoHttp({
    autoLogging: true,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

let ready = false;
let stopRefresher; // 👈
let invConsumer;
app.get('/health', (_req, res) => res.status(ready ? 200 : 503).json({ ok: ready }));
app.get('/metrics', (_req, res) => res.type('text/plain').send('multivende_oms_up 1'));
app.use('/mv', oauthRoutes);
app.use('/mv', webhooks);
app.use('/multivende', webhooks);
app.use('/mv', rebuildRoutes);

app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
app.use((err, req, res, _next) => {
  req.log?.error({ err }, '[UNHANDLED_ERROR]');
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

const port = Number(process.env.PORT || 5016);
let server;

async function bootstrap() {
  try {
    await connectPool();
    await initKafka();

    try {
      const fixed = await repairAuthRow();
      if (fixed) console.log('[MV OAUTH] OauthTokens reparado desde JWT (refresh/expires).');
    } catch (e) {
      console.warn('[MV OAUTH] No se pudo reparar OauthTokens en el arranque:', e.message);
    }

    // 👇 Dispara el refresher (tick inmediato imprimirá “TOKEN LISTO” si todo ok)
    stopRefresher = startTokenRefresher({ intervalMs: 5 * 60 * 1000 });
    
      if (process.env.ENABLE_RETRY_CRON === 'true') {
        startRetryWorker();
        console.log('[MV-OMS] Retry worker iniciado');
      }
      if (process.env.KAFKA_INVENTORY_TOPIC) {
        invConsumer = await startInventoryConsumer();
        console.log('[MV-OMS] Inventory consumer iniciado');
      }
    ready = true;
    server = app.listen(port, () => {
      console.log(`[MV-OMS] listening on :${port}`);
    });
  } catch (e) {
    console.error('[BOOT ERROR]', e);
    process.exit(1);
  }
}



async function shutdown(code = 0) {
  try {
    ready = false;
    stopRefresher?.(); // 👈 detener
    stopRetryWorker();
    await invConsumer?.disconnect?.().catch(() => {});
    await shutdownKafka?.();
    await closePool?.();
    
    if (server) await new Promise((resolve) => server.close(resolve));
    setTimeout(() => process.exit(code), 3000).unref();
  } catch (e) {
    console.error('[SHUTDOWN ERROR]', e);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('unhandledRejection', (reason) => console.error('[UNHANDLED REJECTION]', reason));
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  shutdown(1);
});

bootstrap();
