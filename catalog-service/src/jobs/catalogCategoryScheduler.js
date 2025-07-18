const cron = require('node-cron');
const runAuxSyncJob = require('../jobs/catalogAuxSyncJob');


cron.schedule('40 18 * * *', async () => {
  console.log(`Ejecutando job de tablas auxiliares [${new Date().toLocaleString()}]`);
  await runAuxSyncJob();
}, {
  timezone: 'America/Santiago'
});
