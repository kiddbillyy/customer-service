// Actualiza UDFs de ítems (OITM) en SAP B1 a partir de la tabla staging (VtexSkuInfo)
const { catalogPoolConnect, catalogPool } = require('../config/db');
const { sapRequest } = require('../config/sapSl');

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

/**
 * Lee SKUs pendientes de exportar (VtexSkuInfo.ExportedToSAP = 0),
 * resuelve los IDs de categoría (L1/L2/L3) contra dbo.VtexCategories
 * y hace PATCH a /Items('ItemCode') con U_MARCA, U_PRIMER_NIVEL, U_CATEGORIA,
 * U_SUBCATEGORIA y U_IMAGEN (y opcionalmente ItemName).
 */
async function exportSkusUdfsToSap() {
  await catalogPoolConnect;

  const batchSize   = Number(process.env.SKU_SAP_EXPORT_BATCH || 500);
  const concurrency = Number(process.env.SAP_CONCURRENCY || 6);
  const updateName  = /^1|true|yes$/i.test(process.env.SKU_UPDATE_NAME || '');
  const limiter     = pLimit(concurrency);

  console.log(`⚙️  Export SKUs → SAP | batch=${batchSize} | concurrency=${concurrency} | updateName=${updateName}`);

  let total = 0, loop = 0;

  // Bucle por lotes desde SQL
  while (true) {
    loop++;
    const { recordset } = await catalogPool.request()
      .input('top', batchSize)
      .query(`
        WITH t AS (
          SELECT TOP (@top)
            s.Sku,
            s.Name,
            s.BrandId,
            s.Imagen,
            c1.CategoryId AS L1,
            c2.CategoryId AS L2,
            c3.CategoryId AS L3
          FROM dbo.VtexSkuInfo s
          LEFT JOIN dbo.VtexCategories c1
            ON c1.[Level] = 1 AND c1.[Name] = s.PrimerNivel
          LEFT JOIN dbo.VtexCategories c2
            ON c2.[Level] = 2 AND c2.[Name] = s.Categoria
           AND c2.ParentId = c1.CategoryId
          LEFT JOIN dbo.VtexCategories c3
            ON c3.[Level] = 3 AND c3.[Name] = s.Subcategoria
           AND c3.ParentId = c2.CategoryId
          WHERE s.ExportedToSAP = 0
          ORDER BY s.Sku
        )
        SELECT * FROM t
      `);

    if (!recordset.length) break;

    console.log(`\n=== Lote #${loop} — filas: ${recordset.length} ===`);
    let ok = 0, fail = 0;

    await Promise.all(
      recordset.map(row => limiter(async () => {
        const sku = String(row.Sku).trim();
        const payload = {};

        if (row.BrandId != null)        payload.U_MARCA        = String(row.BrandId);
        if (row.L1 != null)             payload.U_PRIMER_NIVEL = String(row.L1);
        if (row.L2 != null)             payload.U_CATEGORIA    = String(row.L2);
        if (row.L3 != null)             payload.U_SUBCATEGORIA = String(row.L3);
        if (row.Imagen)                 payload.U_IMAGEN       = row.Imagen;
        if (updateName && row.Name)     payload.ItemName       = row.Name;

        // Si no hay nada para actualizar, saltamos
        if (!Object.keys(payload).length) {
          console.log(`↷ SKU ${sku} sin cambios mapeables (payload vacío).`);
          return;
        }

        try {
          // PATCH a OITM
          await sapRequest('patch', `/Items('${sku}')`, payload);

          // Marcar como exportado
          await catalogPool.request().query(`
            UPDATE dbo.VtexSkuInfo
            SET ExportedToSAP = 1,
                LastExportUtc = SYSUTCDATETIME()
            WHERE Sku = '${sku.replace(/'/g, "''")}'
          `);

          ok++;
          if (ok % 200 === 0) console.log(`  · Actualizados OK: ${ok}`);
        } catch (e) {
          fail++;
          const msg = e.response?.data?.error?.message?.value || e.message;
          const st  = e.response?.status;
          console.warn(`  ! SKU ${sku} fallo PATCH: ${st || ''} ${msg}`);

          // Opcional: si 404 (ítem no existe en SAP), podrías marcarlo como exportado
          // para no reintentar en cada corrida. Si querés reintentar, dejalo así.
          // if (st === 404) {
          //   await catalogPool.request().query(`
          //     UPDATE dbo.VtexSkuInfo SET ExportedToSAP = 1, LastExportUtc = SYSUTCDATETIME()
          //     WHERE Sku = '${sku.replace(/'/g, "''")}'
          //   `);
          // }
        }
      }))
    );

    total += recordset.length;
    console.log(`✔ Lote #${loop} listo — OK=${ok} | FAIL=${fail} | acumulado=${total}`);
  }

  console.log(`\n✅  Export SKUs → SAP finalizado. Filas procesadas: ${total}`);
}

module.exports = { exportSkusUdfsToSap };
