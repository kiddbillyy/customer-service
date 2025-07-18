/* const sapPool = require('../config/dbSap');
const catalogPool = require('../config/db');

async function syncPriceList() {
  const [precios] = await sapPool.query(`
    SELECT 
	  ItemCode,
	  PriceList,
	  Price
    FROM ITM1;
    `
);
  for (const p of precios) {
    await catalogPool.query(`
      MERGE INTO dbo.ITM1_ListPrice AS target
      USING (SELECT ? AS ItemCode, ? AS PriceList) AS source
      ON target.ItemCode = source.ItemCode
         AND target.PriceList = source.PriceList
      WHEN MATCHED THEN
        UPDATE SET 
          Price = ?
      WHEN NOT MATCHED THEN
        INSERT (ItemCode, PriceList, Price)
        VALUES (?, ?, ?);
    `, [
      p.ItemCode, p.PriceList, p.Price,
      p.ItemCode, p.PriceList, p.Price
    ]);
  }

  return precios.length;
}

module.exports = { syncPriceList };
 */

/* 
const sapPool = require('../config/dbSap');
const catalogPool = require('../config/db'); // OMS


async function syncPriceList() {
  const conn = catalogPool  // si tu lib soporta .getConnection()
  try {
    //await conn.beginTransaction();

    // 1. Leer watermark
    const [metaRows] = await conn.query(`
        SELECT LastSyncDT FROM dbo.SyncMeta WHERE JobName = 'PriceSync_OITM'
    `);
    const lastSync = metaRows.length ? metaRows[0].LastSyncDT : null;

    if (!lastSync) {
      // ===== CARGA INICIAL =====
      const [allPrices] = await sapPool.query(`
          SELECT ItemCode, PriceList, Price
          FROM ITM1
      `);

      await bulkMergePrices(conn, allPrices); // Insertará todos

      await conn.query(`
        MERGE dbo.SyncMeta AS T
        USING (SELECT 'PriceSync_OITM' AS JobName, GETUTCDATE() AS LastSyncDT) AS S
          ON T.JobName = S.JobName
        WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
        WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
      `);

      await conn.commit();
      return {
        initialLoad: true,
        inserted: allPrices.length,
        updated: 0,
        scannedItems: null,
        scannedPrices: allPrices.length
      };
    }

    const now = new Date();
    const from = new Date(lastSync.getTime() - 60 * 1000);

    const [changedItems] = await sapPool.query(`
      DECLARE @FromDT DATETIME = ?;
      DECLARE @NowDT  DATETIME = ?;

      WITH ChangedItems AS (
        SELECT i.ItemCode,
               FullUpdateDT = DATEADD(SECOND,
                         ((i.UpdateTS / 10000) * 3600) +
                         (((i.UpdateTS % 10000) / 100) * 60) +
                         (i.UpdateTS % 100),
                         CAST(i.UpdateDate AS DATETIME))
        FROM OITM i
        WHERE DATEADD(SECOND,
                      ((i.UpdateTS / 10000) * 3600) +
                      (((i.UpdateTS % 10000) / 100) * 60) +
                      (i.UpdateTS % 100),
                      CAST(i.UpdateDate AS DATETIME)) >  @FromDT
          AND DATEADD(SECOND,
                      ((i.UpdateTS / 10000) * 3600) +
                      (((i.UpdateTS % 10000) / 100) * 60) +
                      (i.UpdateTS % 100),
                      CAST(i.UpdateDate AS DATETIME)) <= @NowDT
      )
      SELECT DISTINCT ItemCode
      FROM ChangedItems;
    `, [from, now]);

    if (changedItems.length === 0) {
    
      await conn.query(`
        MERGE dbo.SyncMeta AS T
        USING (SELECT 'PriceSync_OITM' AS JobName, ? AS LastSyncDT) AS S
          ON T.JobName = S.JobName
        WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
        WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
      `, [now]);

      await conn.commit();
      return {
        initialLoad: false,
        inserted: 0,
        updated: 0,
        scannedItems: 0,
        scannedPrices: 0
      };
    }

    
    const batchSize = 500;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalPrices = 0;

    for (let i = 0; i < changedItems.length; i += batchSize) {
      const batch = changedItems.slice(i, i + batchSize).map(r => r.ItemCode);
      const placeholders = batch.map(() => '?').join(',');
      const [priceRows] = await sapPool.query(`
         SELECT ItemCode, PriceList, Price
         FROM ITM1
         WHERE ItemCode IN (${placeholders})
      `, batch);

      totalPrices += priceRows.length;
      const { inserted, updated } = await bulkMergePrices(conn, priceRows);
      totalInserted += inserted;
      totalUpdated += updated;
    }

    await conn.query(`
      MERGE dbo.SyncMeta AS T
      USING (SELECT 'PriceSync_OITM' AS JobName, ? AS LastSyncDT) AS S
        ON T.JobName = S.JobName
      WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
      WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
    `, [now]);

    await conn.commit();
    return {
      initialLoad: false,
      inserted: totalInserted,
      updated: totalUpdated,
      scannedItems: changedItems.length,
      scannedPrices: totalPrices
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function bulkMergePrices(conn, rows) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  await conn.query(`
    IF OBJECT_ID('tempdb..#Delta') IS NOT NULL DROP TABLE #Delta;
    CREATE TABLE #Delta (
      ItemCode NVARCHAR(50),
      PriceList SMALLINT,
      Price NUMERIC(19,6)
    );
  `);

  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk.map(() => `(?, ?, ?)`).join(',');
    const params = [];
    chunk.forEach(r => {
      params.push(r.ItemCode, r.PriceList, r.Price);
    });
    await conn.query(`INSERT INTO #Delta (ItemCode, PriceList, Price) VALUES ${values}`, params);
  }

  const [resultRows] = await conn.query(`
    MERGE dbo.ITM1_ListPrice AS T
    USING #Delta AS S
       ON T.ItemCode = S.ItemCode AND T.PriceList = S.PriceList
    WHEN MATCHED AND T.Price <> S.Price THEN
       UPDATE SET T.Price = S.Price, T.UpdatedAt = GETUTCDATE()
    WHEN NOT MATCHED THEN
       INSERT (ItemCode, PriceList, Price, CreatedAt)
       VALUES (S.ItemCode, S.PriceList, S.Price, GETUTCDATE())
    OUTPUT $action AS MergeAction;
  `);

  let inserted = 0, updated = 0;
  for (const r of resultRows) {
    if (r.MergeAction === 'INSERT') inserted++;
    else if (r.MergeAction === 'UPDATE') updated++;
  }
  return { inserted, updated };
}



module.exports = { syncPriceList }; */



const { sql, sapPool } = require('../config/dbnewsap');
const { catalogPool } = require('../config/dbnew');

// Configuración
const SAFETY_LAG_MS = 60 * 1000; // 1 minuto
const BATCH_SIZE = 500;
const CHUNK_INSERT = 1000; // batch para bulk() hacia #Delta

/**
 * Sincroniza lista de precios ITM1 -> OMS.
 * Retorna métricas básicas.
 */
async function syncPriceList() {
  // Asegura que los pools estén conectados
  if (sapPool.connected !== true) {
    await sapPool.connect();
  }
  if (catalogPool.connected !== true) {
    await catalogPool.connect();
  }

  const tx = new sql.Transaction(catalogPool);
  await tx.begin();

  const metrics = {
    initialLoad: false,
    watermarkFrom: null,
    watermarkTo: null,
    changedItems: 0,
    scannedPrices: 0,
    inserted: 0,
    updated: 0,
    batches: 0
  };

  try {
    // 1. Leer watermark
    const wmReq = new sql.Request(tx);
    const wmRes = await wmReq.query(`
      SELECT LastSyncDT FROM dbo.SyncMeta WHERE JobName='PriceSync_OITM'
    `);
    const lastSync = wmRes.recordset.length ? wmRes.recordset[0].LastSyncDT : null;

    if (!lastSync) {
      metrics.initialLoad = true;

      const sapReq = new sql.Request(sapPool);
      const allRes = await sapReq.query(`
        SELECT 
  ItemCode = ItemCode COLLATE SQL_Latin1_General_CP850_CI_AS,
  PriceList,
  Price
FROM ITM1

      `);

      metrics.scannedPrices = allRes.recordset.length;
      const { inserted, updated } = await bulkMergePricesTx(tx, allRes.recordset);
      metrics.inserted = inserted;
      metrics.updated = updated;

      const upReq = new sql.Request(tx);
      upReq.input('dt', sql.DateTime, new Date());
      await upReq.query(`
        MERGE dbo.SyncMeta AS T
        USING (SELECT 'PriceSync_OITM' AS JobName, @dt AS LastSyncDT) AS S
          ON T.JobName = S.JobName
        WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
        WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
      `);

      await tx.commit();
      return metrics;
    }

    // Incremental
    const now = new Date();
    const from = new Date(lastSync.getTime() - SAFETY_LAG_MS);
    metrics.watermarkFrom = from.toISOString();
    metrics.watermarkTo = now.toISOString();

    const changedReq = new sql.Request(sapPool);
    changedReq.input('from', sql.DateTime, from);
    changedReq.input('now', sql.DateTime, now);

    const changedRes = await changedReq.query(`
      WITH ChangedItems AS (
        SELECT 
    ItemCode = i.ItemCode COLLATE SQL_Latin1_General_CP850_CI_AS,
    FullUpdateDT = DATEADD(SECOND,
       ((i.UpdateTS / 10000) * 3600) +
       (((i.UpdateTS % 10000) / 100) * 60) +
       (i.UpdateTS % 100),
       CAST(i.UpdateDate AS DATETIME))
  FROM OITM i
        WHERE DATEADD(SECOND,
                 ((i.UpdateTS / 10000) * 3600) +
                 (((i.UpdateTS % 10000) / 100) * 60) +
                 (i.UpdateTS % 100),
                 CAST(i.UpdateDate AS DATETIME)) >  @from
          AND DATEADD(SECOND,
                 ((i.UpdateTS / 10000) * 3600) +
                 (((i.UpdateTS % 10000) / 100) * 60) +
                 (i.UpdateTS % 100),
                 CAST(i.UpdateDate AS DATETIME)) <= @now
      )
      SELECT DISTINCT ItemCode
      FROM ChangedItems;
    `);

    const changedItems = changedRes.recordset.map(r => r.ItemCode);
    metrics.changedItems = changedItems.length;

    if (!changedItems.length) {
      const upReq = new sql.Request(tx);
      upReq.input('dt', sql.DateTime, now);
      await upReq.query(`
        MERGE dbo.SyncMeta AS T
        USING (SELECT 'PriceSync_OITM' AS JobName, @dt AS LastSyncDT) AS S
          ON T.JobName = S.JobName
        WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
        WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
      `);
      await tx.commit();
      return metrics;
    }

    // Batches de ItemCode
    const batches = [];
    for (let i = 0; i < changedItems.length; i += BATCH_SIZE) {
      batches.push(changedItems.slice(i, i + BATCH_SIZE));
    }
    metrics.batches = batches.length;

    for (let b = 0; b < batches.length; b++) {
      const codes = batches[b];
      const priceReq = new sql.Request(sapPool);
      codes.forEach((code, idx) => {
        priceReq.input('code' + idx, sql.NVarChar(50), code);
      });
      const inList = codes.map((_, idx) => '@code' + idx).join(',');

      const priceRes = await priceReq.query(`
        SELECT 
  ItemCode = ItemCode COLLATE SQL_Latin1_General_CP850_CI_AS,
  PriceList,
  Price
FROM ITM1
WHERE ItemCode IN  (${inList})
      `);

      metrics.scannedPrices += priceRes.recordset.length;

      const { inserted, updated } = await bulkMergePricesTx(tx, priceRes.recordset);
      metrics.inserted += inserted;
      metrics.updated += updated;
    }

    // Actualiza watermark
    const wmUpReq = new sql.Request(tx);
    wmUpReq.input('dt', sql.DateTime, now);
    await wmUpReq.query(`
      MERGE dbo.SyncMeta AS T
      USING (SELECT 'PriceSync_OITM' AS JobName, @dt AS LastSyncDT) AS S
        ON T.JobName = S.JobName
      WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
      WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
    `);

    await tx.commit();
    return metrics;

  } catch (err) {
    try { await tx.rollback(); } catch {}
    throw err;
  }
}

/**
 * Inserta en #Delta por bulk() y MERGE en la misma transacción
 * @param {sql.Transaction} tx
 * @param {Array<{ItemCode,PriceList,Price}>} rows
 */
async function bulkMergePricesTx(tx, rows) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  // Crear #Delta
  const createReq = new sql.Request(tx);
  await createReq.batch(`
    IF OBJECT_ID('tempdb..#Delta') IS NOT NULL DROP TABLE #Delta;
    CREATE TABLE #Delta (
  ItemCode NVARCHAR(50) COLLATE SQL_Latin1_General_CP850_CI_AS,
  PriceList SMALLINT,
  Price NUMERIC(19,6)
);

  `);

  // Insertar por CHUNK_INSERT usando bulk()
  for (let i = 0; i < rows.length; i += CHUNK_INSERT) {
    const chunk = rows.slice(i, i + CHUNK_INSERT);
    const tvp = new sql.Table('#Delta');
    tvp.create = false;  // ya existe
    tvp.columns.add('ItemCode', sql.NVarChar(50), { nullable: true });
    tvp.columns.add('PriceList', sql.SmallInt, { nullable: true });
    tvp.columns.add('Price', sql.Numeric(19, 6), { nullable: true });

    chunk.forEach(r => tvp.rows.add(r.ItemCode, r.PriceList, r.Price));

    const bulkReq = new sql.Request(tx);
    await bulkReq.bulk(tvp);
  }

  // MERGE
  const mergeReq = new sql.Request(tx);
  const mergeRes = await mergeReq.query(`
    MERGE dbo.ITM1_ListPrice AS T
USING #Delta AS S
  ON T.ItemCode COLLATE SQL_Latin1_General_CP850_CI_AS =
     S.ItemCode COLLATE SQL_Latin1_General_CP850_CI_AS
 AND T.PriceList = S.PriceList
WHEN MATCHED AND T.Price <> S.Price THEN
  UPDATE SET T.Price = S.Price, T.UpdatedAt = GETUTCDATE()
WHEN NOT MATCHED THEN
  INSERT (ItemCode, PriceList, Price, CreatedAt)
  VALUES (S.ItemCode, S.PriceList, S.Price, GETUTCDATE())
OUTPUT $action AS MergeAction;

  `);

  let inserted = 0, updated = 0;
  mergeRes.recordset.forEach(r => {
    if (r.MergeAction === 'INSERT') inserted++;
    else if (r.MergeAction === 'UPDATE') updated++;
  });

  return { inserted, updated };
}

module.exports = { syncPriceListxd };
