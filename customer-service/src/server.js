import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import customers from './routes/customers.js';
import masterdata from './routes/masterdata.js';
import { getPool } from './config/db.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok;');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'down' });
  }
});

app.use('/customers', customers);
app.use('/masterdata', masterdata);

app.use((err, _req, res, _next) => {
  // Manejador simple
  console.error(err);
  if (err?.issues) return res.status(400).json({ error: 'VALIDATION_FAILED', details: err.issues });
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

const PORT = Number(5008);
app.listen(PORT, () => console.log(`Customer Service listening on :${PORT}`));
