const { syncGroup } = require('../services/ItmsGrpSync');

async function runItmsJobs() {
  try {
    console.log('Iniciando job de sincronización de tabla grupo de productos');
    await syncGroup();
    console.log(' Job de sincronización completado.');
  } catch (err) {
    console.error(' Error en job de tablas auxiliares:', err);
  }
}

module.exports = runItmsJobs;
