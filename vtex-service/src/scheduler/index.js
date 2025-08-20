const cron = require('node-cron');
const { runSync } = require('../jobs/syncJob');                 // VTEX → SQL
const { exportBrands, exportCategories } = require('../services/sapExportService');

/* ───── tarea que pasa staging → SAP ───── */
async function runExport() {
  console.log('⏳  Exportando VTEX_SYNC → SAP');
  await exportBrands();        // /U_MARCA
  await exportCategories();    // /U_PRIMER_NIVEL /U_CATEGORIA /U_SUBCATEGORIA
  console.log('✅  Export a SAP OK');
}

/* ───── arranca los dos cron jobs ───── */
function startScheduler() {
  /* cron #1 : VTEX → SQL   cada 2 h, minuto 0  */
  cron.schedule('0 */2 * * *', runSync);

  /* cron #2 : SQL → SAP    cada 5 min           */
    cron.schedule('0 */2 * * *',runExport);

  console.log('🕒  Scheduler ON – VTEX cada 2 h | SAP cada 5 min');
}

module.exports = { startScheduler, runExport };
