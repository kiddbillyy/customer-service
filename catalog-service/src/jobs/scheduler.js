const cron = require('node-cron');
const runSyncJob = require('./catalogSynscJob');
const runSyncPriceJob = require('./catalogPriceListSynscJob')

console.log('Job de sincronización cada 1 minuto...');

cron.schedule('*/5 * * * *', async () => {
  const now = new Date().toLocaleString();
  console.log(`Iniciando sincronización de catálogo [${now}]`);
  try {
/*     const countCatalog = await runSyncJob();
    console.log(`Catálogo sincronizado: ${countCatalog} registros [${new Date().toLocaleString()}]`);
 */
    console.log(`Iniciando sincronización de precios [${new Date().toLocaleString()}]`);
    const countPrices = await runSyncPriceJob();
    console.log(`Precios sincronizados: ${countPrices} registros [${new Date().toLocaleString()}]`);
  } catch (err) {
    console.error(`Error en sincronización [${new Date().toLocaleString()}]:`, err);
  }
});
