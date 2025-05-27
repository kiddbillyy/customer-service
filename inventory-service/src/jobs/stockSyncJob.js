const cron = require('node-cron');
const { syncMovements } = require('../services/stockSyncService');
//  */5 * * * *  ==> minuto */5, hora *, día *, mes *, díaSemana *
cron.schedule('0 0 * * *', async () => {
  console.log('--- Sync stock --- ');
  await syncMovements ();
});


// */20 * * * * * 20 segundos