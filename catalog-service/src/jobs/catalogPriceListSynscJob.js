const { syncPriceList } = require('../services/PriceListService');

async function runSyncPriceJob() {
  try {
    console.log('⏳ Iniciando job de sincronización de Lista de Precios...');
    const total = await syncPriceList();
    console.log(`✅ Job completado. ${total} Precios sincronizados.`);
  } catch (err) {
    console.error('❌ Error en job de sincronización:', err.message);
  }
}

module.exports = runSyncPriceJob;
