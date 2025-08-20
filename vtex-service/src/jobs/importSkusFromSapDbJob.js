// src/jobs/importSkusFromSapDbJob.js
require('dotenv').config();
const { streamActiveSkus }  = require('../services/sapProductsService');
const { fetchVtexSkuInfo }  = require('../services/vtexSkuService');
const { upsertVtexSkuInfo } = require('../services/sqlSkusService');

function pLimit(concurrency) {
  const queue = [];
  let active = 0;
  const next = () => { active--; queue.shift()?.(); };
  return fn => new Promise((resolve, reject) => {
    const run = () => {
      active++;
      Promise.resolve(fn()).then(resolve, reject).finally(next);
    };
    active < concurrency ? run() : queue.push(run);
  });
}

async function runImportSkusFromSapDb() {
  console.log('⏳  Importando SKUs: SAP(DB) → (VTEX) → SQL…');

  const concurrency = Number(process.env.VTEX_CONCURRENCY || 6);
  const saveChunk   = Number(process.env.SKU_SAVE_CHUNK   || 2000);
  const sapBatch    = Number(process.env.SAP_BATCH        || 1000);
  const VERBOSE     = /^1|true|yes$/i.test(process.env.VERBOSE || '');

  console.log(`⚙️  Concurrency VTEX=${concurrency} | SaveChunk=${saveChunk} | SapBatch=${sapBatch}`);

  let totalSap = 0, totalVtex = 0, batchNo = 0;

  for await (const batch of streamActiveSkus(sapBatch)) {
    batchNo++;
    console.log(`\n=== Lote #${batchNo} — SAP rows: ${batch.length} ===`);
    console.time(`lote#${batchNo}`);

    totalSap += batch.length;

    // Solo IDs numéricos (VTEX espera numérico)
    const numericBatch = batch.filter(r => /^\d+$/.test(String(r.Sku)));
    const skipped = batch.length - numericBatch.length;
    if (skipped) console.log(`↷  ${skipped} SKU(s) omitidos (no numéricos)`);

    const limiter = pLimit(concurrency);
    const vtexInfos = [];
    let processed = 0, okCount = 0, failCount = 0;

    await Promise.all(
      numericBatch.map(row =>
        limiter(async () => {
          const sku = String(row.Sku);
          try {
            const info = await fetchVtexSkuInfo(sku);
            processed++;
            if (info) { vtexInfos.push(info); okCount++; }
            else { failCount++; } // 404 u omitidos
            if (processed % 500 === 0) {
              console.log(`  · VTEX consultados ${processed}/${numericBatch.length} (lote ${batchNo})`);
            }
          } catch (e) {
            failCount++;
            const code = e.code || e.response?.status || e.message;
            console.warn(`  ! SKU ${sku} falló: ${code}`);
          }
        })
      )
    );

    console.log(`→ VTEX OK: ${okCount} | Fallidos/404: ${failCount}`);

    // Guardar en SQL por trozos
    for (let i = 0; i < vtexInfos.length; i += saveChunk) {
      const chunk = vtexInfos.slice(i, i + saveChunk);
      await upsertVtexSkuInfo(chunk);
      console.log(`  · Guardado chunk ${i + chunk.length}/${vtexInfos.length} (lote ${batchNo})`);
    }

    totalVtex += vtexInfos.length;
    if (VERBOSE) {
      const mem = process.memoryUsage();
      const mb = (x) => (x / 1024 / 1024).toFixed(1);
      console.log(`🧠  Mem: heapUsed=${mb(mem.heapUsed)}MB rss=${mb(mem.rss)}MB`);
    }

    console.timeEnd(`lote#${batchNo}`);
    console.log(`✔ Lote #${batchNo} OK — SAP=${batch.length}, VTEX_guardados=${vtexInfos.length}`);
  }

  console.log(`\n✅  Import SKUs OK — SAP leídos: ${totalSap}, VTEX guardados: ${totalVtex}`);
}

if (require.main === module) {
  runImportSkusFromSapDb().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runImportSkusFromSapDb };
