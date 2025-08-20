// src/services/sapExportService.js
const { catalogPoolConnect, catalogPool } = require('../config/db');
const { sapRequest } = require('../config/sapSl');

/* ──────────── Constantes de tablas UDT en SAP ──────────── */
const TABLE_MARCAS      = 'U_MARCA';          // @MARCA
const TABLE_L1          = 'U_PRIMER_NIVEL';   // @PRIMER_NIVEL
const TABLE_L2          = 'U_CATEGORIA';      // @CATEGORIA
const TABLE_L3          = 'U_SUBCATEGORIA';   // @SUBCATEGORIA

/* ────────────────────────── MARCAS ─────────────────────── */
async function exportBrands() {
  await catalogPoolConnect;

  const { recordset } = await catalogPool.request().query(`
    SELECT BrandId, Name
    FROM   dbo.VtexBrands
    WHERE  ExportedToSAP = 0
  `);

  for (const { BrandId, Name } of recordset) {
    const body = { Code: String(BrandId), Name };

    try {
      await upsertSl(TABLE_MARCAS, BrandId, body);
      await catalogPool.request().query(`
        UPDATE dbo.VtexBrands
        SET    ExportedToSAP = 1,
               LastSyncUtc   = SYSUTCDATETIME()
        WHERE  BrandId = ${BrandId}
      `);
    } catch (err) {
      warn(TABLE_MARCAS, BrandId, err);
    }
  }
}

/* ────────────────── CATEGORÍAS (niveles 1-3) ───────────── */
async function exportCategories() {
  await catalogPoolConnect;

  const { recordset } = await catalogPool.request().query(`
    SELECT CategoryId, ParentId, [Level], Name
    FROM   dbo.VtexCategories
    WHERE  ExportedToSAP = 0
    ORDER  BY [Level]                 -- padres antes que hijos
  `);

  for (const row of recordset) {
    let tableSl, body;

    if (row.Level === 1) {
      tableSl = TABLE_L1;
      body    = { Code: String(row.CategoryId), Name: row.Name };

    } else if (row.Level === 2) {
      tableSl = TABLE_L2;
      body    = {
        Code           : String(row.CategoryId),
        Name           : row.Name,
        U_PRIMER_NIVEL : String(row.ParentId)
      };

    } else if (row.Level === 3) {
      tableSl = TABLE_L3;
      body    = {
        Code       : String(row.CategoryId),
        Name       : row.Name,
        U_CATEGORIA: String(row.ParentId)
      };

    } else {             // niveles fuera de rango
      console.warn('[SAP] Nivel de categoría no soportado:', row.Level);
      continue;
    }

    try {
      await upsertSl(tableSl, row.CategoryId, body);
      await catalogPool.request().query(`
        UPDATE dbo.VtexCategories
        SET    ExportedToSAP = 1,
               LastSyncUtc   = SYSUTCDATETIME()
        WHERE  CategoryId = ${row.CategoryId}
      `);
    } catch (err) {
      warn(tableSl, row.CategoryId, err);
    }
  }
}

/* ────────────── helper POST + PATCH (409) ─────────────── */
async function upsertSl(tableSl, code, body) {
  const url = `/${tableSl}`;
  try {
    // ───── POST ─────
    console.log('→ POST', url, body);
    const res = await sapRequest('post', url, body);
    console.log('  ←', res.status, res.statusText);
  } catch (e) {
    if (e.response?.status === 409) {
      // ───── PATCH si ya existe ─────
      const patchUrl = `/${tableSl}('${code}')`;
      console.log('→ PATCH', patchUrl, body);
      const res = await sapRequest('patch', patchUrl, body);
      console.log('  ←', res.status, res.statusText);
    } else {
      // log detallado del error
      warn(tableSl, code, e);
      throw e;
    }
  }
}

/* ---------- logging amigable ---------- */
function warn(table, code, err) {
  const msg    = err.response?.data?.error?.message?.value || err.message;
  const status = err.response?.status;
  const url    = err.config?.url;
  console.error(`[SAP] ${table} código ${code}: ${msg}`);
  if (status) console.error('  ↳ Status :', status);
  if (url)    console.error('  ↳ URL    :', url);
}

module.exports = { exportBrands, exportCategories };
