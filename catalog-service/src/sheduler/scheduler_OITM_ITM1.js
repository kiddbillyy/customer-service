const cron = require('node-cron');
const runSyncJob = require('../jobs/CatalogJob');
const runSyncPriceJob = require('../jobs/catalogPriceListSynscJob');
const runAuxSyncJob = require('../jobs/CategoryJob');
const runItmsJobs = require('../jobs/ItmsGrpJob');

console.log('🔁 Job unificado de sincronización programado para ejecutarse cada 3 minutos...');

cron.schedule('*/3 * * * *', async () => {
  const now = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  console.log(`🕒 Iniciando sincronización completa [${now}]`);

  const start = Date.now();

  try {
    // Paso 1: Catálogo
    console.log('🔹 Iniciando sincronización de catálogo...');
    await runSyncJob();

    // Paso 2: Precios
    /*console.log('🔹 Iniciando sincronización de precios...');
    const priceMetrics = await runSyncPriceJob();
    const totalPrices = priceMetrics.inserted + priceMetrics.updated;
    console.log(`✅ Precios sincronizados: ${totalPrices} (Insertados: ${priceMetrics.inserted}, Actualizados: ${priceMetrics.updated})`); */

    // Paso 3: Categorías
    console.log('🔹 Iniciando sincronización de categorías...');
    await runAuxSyncJob();
    console.log('✅ Categorías sincronizadas correctamente.');

    // Paso 4: Grupos de ítems
    console.log('🔹 Iniciando sincronización de grupos de ítems...');
    await runItmsJobs();
    console.log('✅ Grupos de ítems sincronizados correctamente.');

  } catch (err) {
    console.error('❌ Error general durante la sincronización:', err.message);
  } finally {
    const end = Date.now();
    const duration = ((end - start) / 1000).toFixed(2);
    console.log(`⏱ Sincronización total finalizada en ${duration} segundos.\n---`);
  }
}, {
  timezone: 'America/Santiago'
});
