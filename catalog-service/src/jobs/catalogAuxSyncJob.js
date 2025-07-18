const { syncAuxCatalogs } = require('../services/catalogCategorySyncService');

async function runAuxSyncJob() {
  try {
    console.log('Iniciando job de sincronización de tablas auxiliares...');
    await syncAuxCatalogs();
    console.log(' Job de sincronización de tablas auxiliares completado.');
  } catch (err) {
    console.error(' Error en job de tablas auxiliares:', err);
  }
}

module.exports = runAuxSyncJob;
