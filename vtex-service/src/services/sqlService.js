const sql = require('mssql');
const { catalogPoolConnect, catalogPool } = require('../config/db');

/* ── Categorías ─────────────────────────────────────────── */
exports.upsertCategories = async function upsertCategories(list) {
  await catalogPoolConnect;          // espera pool

  // TVP para rendimiento
  const tvp = new sql.Table('dbo.CategoryTableType');  // <─ nombre exacto
  tvp.columns.add('CategoryId', sql.Int);
  tvp.columns.add('ParentId',   sql.Int);
  tvp.columns.add('Level',      sql.TinyInt);
  tvp.columns.add('Name',       sql.NVarChar(255));
  tvp.columns.add('IsActive',   sql.Bit);

  list.forEach(c =>
    tvp.rows.add(c.CategoryId, c.ParentId, c.Level, c.Name, c.IsActive)
  );

  await catalogPool.request()
    .input('Cats', tvp)              // @Cats TVP
    .query(`
      MERGE dbo.VtexCategories AS tgt
      USING @Cats AS src
        ON tgt.CategoryId = src.CategoryId
      WHEN MATCHED AND (
           ISNULL(tgt.ParentId,0) <> ISNULL(src.ParentId,0) OR
           tgt.[Level]            <> src.[Level]            OR
           tgt.[Name]             <> src.[Name]             OR
           tgt.IsActive           <> src.IsActive)
        THEN UPDATE SET
          ParentId      = src.ParentId,
          [Level]       = src.[Level],
          [Name]        = src.[Name],
          IsActive      = src.IsActive,
          LastSyncUtc   = SYSUTCDATETIME(),
          ExportedToSAP = 0
      WHEN NOT MATCHED BY TARGET
        THEN INSERT (CategoryId, ParentId, [Level], [Name], IsActive)
             VALUES (src.CategoryId, src.ParentId, src.[Level],
                     src.[Name], src.IsActive);
    `);
};

/* ── Marcas ─────────────────────────────────────────────── */
exports.upsertBrands = async function upsertBrands(list) {
  await catalogPoolConnect;

  const tvp = new sql.Table('dbo.BrandTableType');
  tvp.columns.add('BrandId',  sql.Int);
  tvp.columns.add('Name',     sql.NVarChar(255));
  tvp.columns.add('IsActive', sql.Bit);

  list.forEach(b =>
    tvp.rows.add(b.BrandId, b.Name, b.IsActive)
  );

  await catalogPool.request()
    .input('Brands', tvp)
    .query(`
      MERGE dbo.VtexBrands AS tgt
      USING @Brands AS src
        ON tgt.BrandId = src.BrandId
      WHEN MATCHED AND (
           tgt.[Name]   <> src.[Name] OR
           tgt.IsActive <> src.IsActive)
        THEN UPDATE SET
          [Name]        = src.[Name],
          IsActive      = src.IsActive,
          LastSyncUtc   = SYSUTCDATETIME(),
          ExportedToSAP = 0
      WHEN NOT MATCHED BY TARGET
        THEN INSERT (BrandId, [Name], IsActive)
             VALUES (src.BrandId, src.[Name], src.IsActive);
    `);
};
