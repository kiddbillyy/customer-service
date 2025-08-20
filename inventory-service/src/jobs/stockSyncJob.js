/**
 *  StockScheduler (SAP → raw_events → inventario)
 *  ----------------------------------------------
 *  start() => programa ambos cron jobs
 *  stop()  => detiene los jobs (graceful shutdown)
 */

const cron = require('node-cron');
const { syncMovements }    = require('../services/stockSyncService');
const { processRawEvents } = require('../services/rawEventWorker');

let syncJob, processJob;   // referencias a los cron tasks
let running = false;       // evita solapes en processRawEvents()

function start() {
  if (syncJob || processJob) return;           // ya estaban activos

  // 1️⃣  SAP → raw_events  (cada 20 s)
  syncJob = cron.schedule('*/20 * * * * *', async () => {
    try {
      console.log('🔄 SyncMovements: revisando Z_MOVSTOCKOMS…');
      const n = await syncMovements();
      if (n) console.log(`➕  ${n} movimientos SAP añadidos a raw_events`);
    } catch (err) {
      console.error('✖︎ SyncMovements error:', err.message);
    }
  });

  // 2️⃣  raw_events → inventario  (cada 5 s)
  processJob = cron.schedule('*/5 * * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await processRawEvents();         // procesa hasta 200 eventos
    } catch (err) {
      console.error('✖︎ rawEventWorker error:', err.message);
    } finally {
      running = false;
    }
  });

  console.log('⏳ StockScheduler iniciado: SAP→raw (20 s) | raw→inventario (5 s)');
}

function stop() {
  if (syncJob)   { syncJob.stop();   syncJob   = null; }
  if (processJob){ processJob.stop();processJob= null; }
  console.log('🛑 StockScheduler detenido');
}

module.exports = { start, stop };
