const { syncPriceList } = require('../services/PriceListService');

async function runSyncPriceJob() {
  try {
    console.log('⏳ Iniciando job de sincronización de Lista de Precios...');
    const metrics = await syncPriceList();
    const total = metrics.inserted + metrics.updated;
    console.log(`✅ Job de Precios completado. ${total} precios sincronizados (${metrics.inserted} insertados, ${metrics.updated} actualizados`);
  } catch (err) {
    console.error('❌ Error en job de sincronización:', err.message);
  }
}

module.exports = runSyncPriceJob;
