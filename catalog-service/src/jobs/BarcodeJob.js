// jobs/BarcodeJob.js
const { syncOBCD } = require('../services/BarcodeSync'); 

async function runBarcodeJob() {
  try {
    console.log('⏳ Iniciando job de sincronización de códigos de barras...');
    const metrics = await syncOBCD();
    const total = metrics.inserted + metrics.updated;
    console.log(`✅ Job de códigos de barras completado. ${total} registros sincronizados (${metrics.inserted} insertados, ${metrics.updated} actualizados).`);
    return metrics;
  } catch (err) {
    console.error('❌ Error en job de sincronización de códigos de barras:', err.message);
    throw err;
  }
}

module.exports = runBarcodeJob;