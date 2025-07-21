
// jobs/catalogSynsJob.js
const { syncProducts } = require('../services/catalogSyncService'); 

async function runSyncJob() {
  try {
    console.log('⏳ Iniciando job de sincronización de catálogo...');
    const metrics = await syncProducts(); 
    const total = metrics.inserted + metrics.updated;
    console.log(`✅ Job completado. ${total} productos sincronizados (${metrics.inserted} insertados, ${metrics.updated} actualizados).`);
    return metrics; 
  } catch (err) {
    console.error('❌ Error en job de sincronización de catálogo:', err.message);
    throw err;
  }
}

module.exports = runSyncJob; 
