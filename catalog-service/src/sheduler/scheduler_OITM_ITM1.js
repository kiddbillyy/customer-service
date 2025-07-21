const cron = require('node-cron');
const runSyncJob = require('../jobs/catalogSynscJob'); 
const  runSyncPriceJob = require('../jobs/catalogPriceListSynscJob'); 

console.log('Job de sincronización programado para ejecutarse cada 3 minutos...');

cron.schedule('*/3 * * * *', async () => {
  const now = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  console.log(`Iniciando sincronización completa [${now}]`);

  const start = Date.now();
  try {
    const productMetrics = await runSyncJob();
    console.log(` Iniciando job de sincronización de precios...`);
    const priceMetrics = await runSyncPriceJob(); 
    const totalPrices = priceMetrics.inserted + priceMetrics.updated;
    console.log(`Precios sincronizados: ${totalPrices} precios (${priceMetrics.inserted} insertados, ${priceMetrics.updated} actualizados) [${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}]`);

  } catch (err) {
    console.error(`Error en sincronización [${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}]:`, err);
  } finally {
    const end = Date.now();
    const duration = ((end - start) / 1000).toFixed(2);
    console.log(`---`);
    console.log(` Sincronización completa finalizada en ${duration} segundos.`);
  }
});