// 1) Variables de entorno *antes de todo*
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const startConsumer = require('./consumer/inventoryConsumer'); // exporta una función async
const stockSyncJob  = require('./jobs/stockSyncJob');          // veremos cómo iniciarlo luego

const pricingRoutes   = require('./routes/pricingRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const storeRoutes     = require('./routes/storesRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/inventory', inventoryRoutes);
app.use('/api/store',     storeRoutes);
app.use('/api/pricing',   pricingRoutes);

const PORT = process.env.PORT || 5005;
app.listen(PORT, async () => {
  console.log(`🚀 Inventory Service running on port ${PORT}`);

  // 2) Iniciamos el consumer de Kafka (igual que en Orders)
  await startConsumer();

  // 3) *Después* arrancamos el cron job de sincronización
  //    (Mejor si tu job exporta { start, stop } en vez de auto‑ejecutarse al require)
  stockSyncJob.start();
});
