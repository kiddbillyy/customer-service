// jobs/PriceListJob.js
const { syncPriceLists } = require('../services/ListPriceT');

async function runPriceListJob() {
  try {
    console.log('⏳ Iniciando job de sincronización de categorías...');
    await syncPriceLists();
    console.log('✅ Job de sincronización de categorías completado.');
  } catch (err) {
    console.error('❌ Error en job de sincronización de categorías:', err.message);
    throw err;
  }
}

module.exports = runPriceListJob;