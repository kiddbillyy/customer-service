const { exportBrands, exportCategories } = require('../services/sapExportService');

async function runExport() {
  console.log('⏳  Exportando VTEX_SYNC → SAP…');
  await exportBrands();        // @MARCAS
  await exportCategories();    // @PRIMER_NIVEL / @CATEGORIA / @SUBCATEGORIA
  console.log('✅  Export a SAP OK');
}

module.exports = { runExport };
