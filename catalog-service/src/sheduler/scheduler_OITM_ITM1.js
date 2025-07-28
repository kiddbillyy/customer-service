const cron = require('node-cron');
const runSyncJob = require('../jobs/CatalogJob');
const runSyncPriceJob = require('../jobs/catalogPriceListSynscJob');
const runAuxSyncJob = require('../jobs/CategoryJob');
const runItmsJobs = require('../jobs/ItmsGrpJob');
const runBarcodeJob =require('../jobs/BarcodeJob');
const runPriceListJob = require('../jobs/PriceListJob')
console.log('Tipo de runPriceListJob:', typeof runPriceListJob);

console.log('🔁 Job unificado de sincronización programado para ejecutarse cada 5 minutos...');

cron.schedule('*/3 * * * *', async () => {
  const now = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  console.log(`🕒 Iniciando sincronización completa [${now}]`);

  const start = Date.now();

  try {
    // Paso 1: Catálogo
    console.log('🔹 Iniciando sincronización de catálogo...');
    await runSyncJob();

    // Paso 2: Precios
    console.log('🔹 Iniciando sincronización de precios...');
    await runSyncPriceJob();
    console.log('✅ Precios sincronizados correctamente.');
    // paso 2.5:Lista de precios
    console.log(' Iniciando sincronizacion de lista de precios.')
    await runPriceListJob()
    console.log(' Lista de precios sincronizada correctamente.')
    // Paso 3: Categorías
    console.log('🔹 Iniciando sincronización de categorías...');
    await runAuxSyncJob();
    console.log('✅ Categorías sincronizadas correctamente.');

    // Paso 4: Grupos de ítems
    console.log('🔹 Iniciando sincronización de grupos de ítems...');
    await runItmsJobs();
    console.log('✅ Grupos de ítems sincronizados correctamente.');

    //Paso 5: Codigo de barras
    console.log('🔹 Iniciando sincronización de códigos de barras...');
    await runBarcodeJob();
    console.log('✅ Códigos barra sincronizados correctamente.');

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
