const { syncCatalogProducts } = require('../services/catalogSyncService');

async function runSyncJob() {
  try {
    console.log('⏳ Iniciando job de sincronización de catálogo...');
    const total = await syncCatalogProducts();
    console.log(`✅ Job completado. ${total} productos sincronizados.`);
  } catch (err) {
    console.error('❌ Error en job de sincronización:', err.message);
  }
}

module.exports = runSyncJob;
