require('dotenv').config();
const { exportSkusUdfsToSap } = require('../services/sapSkuUpdateService');
const { catalogPoolConnect } = require('../config/db');
const { sapPoolConnect } = require('../config/dbSap'); // opcional si querés validar conexión

async function runExportSkusToSap() {
  console.log('⏳  Actualizando UDFs en SAP (OITM) desde VtexSkuInfo…');
  await catalogPoolConnect;
  try { await sapPoolConnect; console.log('✅ Conectado a SAP DB'); } catch (_) {}
  await exportSkusUdfsToSap();
  console.log('✅  Export SKUs → SAP OK');
}

if (require.main === module) {
  runExportSkusToSap().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runExportSkusToSap };
