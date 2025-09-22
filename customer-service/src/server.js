import 'dotenv/config'; // carga .env al inicio
import express from 'express';
import cors from 'cors';
import customers from './routes/customers.js';
import masterdata from './routes/masterdata.js';
import { getPool } from './config/db.js';
import { initKafkaProducer, stopKafkaProducer } from './producer/producer.js';
import {
  startSapPriceListSyncConsumer,
  stopSapPriceListSyncConsumer
} from './consumer/sapPriceListSyncConsumer.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok;');
    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ status: 'down' });
  }
});

app.use('/customers', customers);
app.use('/masterdata', masterdata);

// Manejo de errores
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.issues) {
    return res.status(400).json({ error: 'VALIDATION_FAILED', details: err.issues });
  }
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

const PORT = Number(process.env.PORT || 5008);

// guarda el server para shutdown ordenado
const server = app.listen(PORT, async () => {
  console.log(`Customer Service listening on :${PORT}`);
  // 🔌 inicia producer y consumer Kafka
  try {
    await initKafkaProducer();
    await startSapPriceListSyncConsumer();
  } catch (e) {
    console.error('[Kafka] no se pudo iniciar:', e);
  }
});

// 🔻 cierre elegante
async function shutdown() {
  console.log('Shutting down...');
  try { await stopSapPriceListSyncConsumer(); } catch (e) { console.error('stop consumer:', e); }
  try { await stopKafkaProducer(); } catch (e) { console.error('stop producer:', e); }
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
