
// jobs/brandSynsJob.js
const { syncMarcaCatalog } = require('../services/BrandSync'); 

async function runBrandSyncJobs() {
  try {
    console.log('⏳ Iniciando job de sincronización de Marcas...');
    const metrics = await syncMarcaCatalog(); 
    const total = metrics.inserted + metrics.updated;
    console.log(`✅ Job de marcas completado. ${total} marcas sincronizados (${metrics.inserted} insertados, ${metrics.updated} actualizados).`);
    return metrics; 
  } catch (err) {
    console.error('❌ Error en job de sincronización de marcas:', err.message);
    throw err;
  }
}

module.exports = runBrandSyncJobs; 
