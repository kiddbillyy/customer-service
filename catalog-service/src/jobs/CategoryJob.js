// jobs/CategoryJob.js
const { syncAuxCatalogs } = require('../services/CategorySync');

async function runAuxSyncJob() {
  try {
    console.log('⏳ Iniciando job de sincronización de categorías...'); // Descomentar o añadir logs más útiles
    await syncAuxCatalogs();
    console.log('✅ Job de sincronización de categorías completado.'); // Descomentar o añadir logs más útiles
  } catch (err) {
    console.error('❌ Error en job de sincronización de categorías:', err.message); // Asegúrate de que este log esté activo
    throw err; // <-- ¡IMPORTANTE! Relanzar el error
  }
}

module.exports = runAuxSyncJob;