const { syncAuxCatalogs } = require('../services/CategorySync');

async function runAuxSyncJob() {
  try {
    //console.log('Iniciando job de sincronización de tablas categorias');
    await syncAuxCatalogs();
    //console.log(' Job de sincronización de tablas auxiliares completado.');
  } catch (err) {
    //console.error(' Error en job de tablas auxiliares:', err);
  }
}

module.exports = runAuxSyncJob;
