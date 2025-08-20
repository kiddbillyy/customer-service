// src/jobs/syncJob.js
const { fetchCategories, fetchBrands } = require('../services/vtexService');
const { upsertCategories, upsertBrands } = require('../services/sqlService');
const { exportBrands, exportCategories } = require('../services/sapExportService');

async function runSync() {
  console.log('⏳  Sincronizando VTEX → SQL → SAP…');
  const t0 = Date.now();

  try {
    // 1) VTEX
    const [categories, brands] = await Promise.all([
      fetchCategories(3),
      fetchBrands()
    ]);
    console.log(`VTEX ok → cats:${categories.length} brands:${brands.length}`);

    // 2) SQL
    await upsertCategories(categories);
    await upsertBrands(brands);
    console.log('SQL ok (upserts)');

    // 3) SAP (si falla, no tiramos toda la corrida)
    try {
      await exportBrands();
      await exportCategories();
      console.log('SAP ok (export)');
    } catch (e) {
      console.error('⚠️  Error exportando a SAP:', e.response?.data || e.message);
    }

    console.log(`✅  Sync OK en ${Math.round((Date.now() - t0)/1000)}s`);
  } catch (e) {
    console.error('❌  Sync FAILED:', e.response?.data || e.message);
  }
}

module.exports = { runSync };
