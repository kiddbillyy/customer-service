// syncMarcaCatalog.js
const { performance } = require('perf_hooks');
const { sql, sapPool } = require('../config/dbnewsap');
const { catalogPool } = require('../config/dbnew');

const CHUNK_INSERT = 1000;
const DEST_COLLATION = 'SQL_Latin1_General_CP850_CI_AS';

async function syncMarcaCatalog() {
  const t0 = performance.now();

  if (!sapPool.connected) await sapPool.connect();
  if (!catalogPool.connected) await catalogPool.connect();

  const tx = new sql.Transaction(catalogPool);
  await tx.begin();

  try {
    const sapRows = (await sapPool.request().query(
      'SELECT Code, Name, CreateDate, UpdateDate FROM [@MARCA]'
    )).recordset;

    if (!sapRows.length) {
      await tx.commit();
      console.log('✔️ No hay datos de MARCA para sincronizar');
      return true;
    }

    // Crear tabla temporal #Delta
    await tx.request().batch(`
      IF OBJECT_ID('tempdb..#Delta') IS NOT NULL DROP TABLE #Delta;
      CREATE TABLE #Delta (
        Code         NVARCHAR(50)  COLLATE ${DEST_COLLATION},
        Name         NVARCHAR(100) COLLATE ${DEST_COLLATION},
        CreateDate   DATETIME,
        UpdateDate   DATETIME
      );
    `);

    // Cargar datos en chunks a #Delta
    for (let i = 0; i < sapRows.length; i += CHUNK_INSERT) {
      const chunk = sapRows.slice(i, i + CHUNK_INSERT);
      const tvp = new sql.Table('#Delta');
      tvp.create = false;

      tvp.columns.add('Code', sql.NVarChar(50));
      tvp.columns.add('Name', sql.NVarChar(100));
      tvp.columns.add('CreateDate', sql.DateTime);
      tvp.columns.add('UpdateDate', sql.DateTime);

      chunk.forEach(r => tvp.rows.add(
        r.Code, r.Name, r.CreateDate, r.UpdateDate
      ));

      await tx.request().bulk(tvp);
    }
    // MERGE hacia tabla destino dbo.MARCA
    const mergeSql = `
    MERGE dbo.MARCA WITH (HOLDLOCK) AS T
    USING #Delta AS S ON T.Code = S.Code
    WHEN MATCHED THEN
        UPDATE SET T.Name = S.Name
    WHEN NOT MATCHED THEN
        INSERT (Code, Name, CreateDate, UpdateDate)
        VALUES (S.Code, S.Name, S.CreateDate, S.UpdateDate);
    `;

    await tx.request().query(mergeSql);

    await tx.commit();
    return true;

  } catch (err) {
    try { await tx.rollback(); } catch {}
    console.error('❌ Error durante la sincronización de MARCA:', err);
    throw err;
  }
}

module.exports = { syncMarcaCatalog };
