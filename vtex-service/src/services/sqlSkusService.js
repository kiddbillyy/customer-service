// src/services/sqlSkusService.js
const sql = require('mssql');
const { catalogPoolConnect, catalogPool } = require('../config/db');

const cut = (s, max) => (typeof s === 'string' ? s.slice(0, max) : s ?? null);

/**
 * Recibe un array de objetos con:
 *  { Sku, Name, PrimerNivel, Categoria, Subcategoria, Imagen, ReleaseDate, BrandId }
 * Hace MERGE por cada fila (transaccional).
 */
async function upsertVtexSkuInfo(list) {
  if (!Array.isArray(list) || list.length === 0) return;

  await catalogPoolConnect;
  const tx = new sql.Transaction(catalogPool);
  await tx.begin();

  try {
    for (const it of list) {
      const Sku          = String(it.Sku);
      const Name         = cut(it.Name,        255);
      const PrimerNivel  = cut(it.PrimerNivel, 255);
      const Categoria    = cut(it.Categoria,   255);
      const Subcategoria = cut(it.Subcategoria,255);
      const Imagen       = cut(it.Imagen,      800);
      const ReleaseDate  = it.ReleaseDate ? new Date(it.ReleaseDate) : null;
      const BrandId      = (it.BrandId != null && !Number.isNaN(+it.BrandId)) ? parseInt(it.BrandId, 10) : null;

      const req = new sql.Request(tx)
        .input('Sku',         sql.NVarChar(50),  Sku)
        .input('Name',        sql.NVarChar(255), Name)
        .input('PrimerNivel', sql.NVarChar(255), PrimerNivel)
        .input('Categoria',   sql.NVarChar(255), Categoria)
        .input('Subcategoria',sql.NVarChar(255), Subcategoria)
        .input('Imagen',      sql.NVarChar(800), Imagen)
        .input('ReleaseDate', sql.DateTime2(3),  ReleaseDate)
        .input('BrandId',     sql.Int,           BrandId);

      await req.query(`
        MERGE dbo.VtexSkuInfo AS tgt
        USING (SELECT @Sku AS Sku) AS src
           ON tgt.Sku = src.Sku
        WHEN MATCHED THEN
          UPDATE SET
            [Name]        = @Name,
            PrimerNivel   = @PrimerNivel,
            Categoria     = @Categoria,
            Subcategoria  = @Subcategoria,
            Imagen        = @Imagen,
            ReleaseDate   = @ReleaseDate,
            BrandId       = @BrandId,
            UpdatedAtUtc  = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (Sku, [Name], PrimerNivel, Categoria, Subcategoria, Imagen, ReleaseDate, BrandId, CreatedAtUtc, UpdatedAtUtc)
          VALUES (@Sku, @Name, @PrimerNivel, @Categoria, @Subcategoria, @Imagen, @ReleaseDate, @BrandId, SYSUTCDATETIME(), SYSUTCDATETIME());
      `);
    }

    await tx.commit();
  } catch (err) {
    try { await tx.rollback(); } catch {}
    throw err;
  }
}

module.exports = { upsertVtexSkuInfo };
