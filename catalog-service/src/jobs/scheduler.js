const cron = require('node-cron');
const runSyncJob = require('./catalogSynscJob');

console.log('job de sincronización cada 1 minutos...');

cron.schedule('*/1 * * * *', async () => {
  console.log(`Ejecutando sincronización de bd [${new Date().toLocaleString()}]`);
  await runSyncJob();
});
