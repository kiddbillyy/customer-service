const { performance } = require('perf_hooks');
const { sql, sapPool } = require('../config/dbnewsap');
const { catalogPool } = require('../config/dbnew');
const { toZonedTime, zonedTimeToUtc, formatInTimeZone } = require('date-fns-tz');

const SAFETY_LAG_MS = 60 * 1000;
const BATCH_SIZE = 500;
const CHUNK_INSERT = 1000;
const DEST_COLLATION = 'SQL_Latin1_General_CP850_CI_AS';
const SAP_SERVER_TIMEZONE = 'America/Santiago';
const REFERENCE_TIMEZONE = 'UTC';

async function syncPriceList() {
  const t0 = performance.now();

  if (sapPool.connected !== true) await sapPool.connect();
  if (catalogPool.connected !== true) await catalogPool.connect();

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
    batches: 0,
    batchesDetail: [],
    duration: {
      totalMs: 0,
      fetchWatermarkMs: 0,
      fullLoadFetchMs: 0,
      changedItemsMs: 0,
      batchesFetchMs: 0,
      batchesMergeMs: 0,
      watermarkUpdateMs: 0,
      commitMs: 0
    }
  };

  try {
    // 1. Watermark
    const tWM0 = performance.now();
    const wmReq = new sql.Request(tx);
    const wmRes = await wmReq.query(`
      SELECT LastSyncDT FROM dbo.SyncMeta WHERE JobName='PriceSync_OITM'
    `);
    metrics.duration.fetchWatermarkMs = performance.now() - tWM0;
    const lastSync = wmRes.recordset.length ? wmRes.recordset[0].LastSyncDT : null;

    const nowUTC = new Date();

    if (!lastSync) {
      metrics.initialLoad = true;

      const tFull0 = performance.now();
      const sapReq = new sql.Request(sapPool);
      /* const allRes = await sapReq.query(`
        SELECT 
          ItemCode = ItemCode COLLATE ${DEST_COLLATION},
          PriceList,
          Price
        FROM ITM1
      `); */

      const allRes = await sapReq.query(`
        WITH CAMBIO_BASE AS (
        SELECT c.Code AS ItemCode, CAST(1 AS SMALLINT) AS PriceList,
              CAST(c.U_Fecha AS DATETIME) AS EventDTLocal
        FROM [@CAMBIO] c
        WHERE c.U_Fecha IS NOT NULL

        UNION ALL            -- T2 (clon del T1)
        SELECT c.Code, CAST(2 AS SMALLINT),
              CAST(c.U_Fecha AS DATETIME)
        FROM [@CAMBIO] c
        WHERE c.U_Fecha IS NOT NULL
      ),
      CAMBIOT3_BASE AS (     -- T3
        SELECT c.Code AS ItemCode, CAST(3 AS SMALLINT) AS PriceList,
              CASE WHEN c.U_Hora IS NOT NULL THEN DATEADD(SECOND,
                    (CAST(SUBSTRING(c.U_Hora,1,2) AS INT) * 3600) +
                    (CAST(SUBSTRING(c.U_Hora,4,2) AS INT) * 60) +
                    CAST(SUBSTRING(c.U_Hora,7,2) AS INT),
                    CAST(c.U_Fecha AS DATETIME))
                ELSE CAST(c.U_Fecha AS DATETIME) END AS EventDTLocal
        FROM [@CAMBIOT3] c
        WHERE c.U_Fecha IS NOT NULL AND c.U_Lista = 'T3'
      ),
      CAMBIO_LAST AS (       -- última fecha por Item+Lista
        SELECT ItemCode, PriceList, MAX(EventDTLocal) AS UpdatedSapLocal
        FROM (
          SELECT * FROM CAMBIO_BASE
          UNION ALL
          SELECT * FROM CAMBIOT3_BASE
        ) X
        GROUP BY ItemCode, PriceList
      )
      SELECT 
        ItemCode = i.ItemCode COLLATE ${DEST_COLLATION},
        i.PriceList,
        i.Price,
        UpdatedSapUTC = CAST(cl.UpdatedSapLocal AS DATETIME2)
    
      FROM ITM1 i
      LEFT JOIN CAMBIO_LAST cl
        ON cl.ItemCode = i.ItemCode AND cl.PriceList = i.PriceList;
      `)
      metrics.duration.fullLoadFetchMs = performance.now() - tFull0;

      metrics.scannedPrices = allRes.recordset.length;

      const allRows = allRes.recordset.map(r => ({
        ItemCode: r.ItemCode,
        PriceList: r.PriceList,
        Price: r.Price,
        UpdatedSap: r.UpdatedSapUTC || null
      }));


      const tMerge0 = performance.now();
      const { inserted, updated } = await bulkMergePricesTx(tx, allRows);
      metrics.duration.batchesMergeMs += (performance.now() - tMerge0);
      metrics.inserted = inserted;
      metrics.updated = updated;

      const tWMU0 = performance.now();
      const upReq = new sql.Request(tx);
      await upReq.query(`
        MERGE dbo.SyncMeta AS T
        USING (SELECT 'PriceSync_OITM' AS JobName, GETUTCDATE() AS LastSyncDT) AS S
          ON T.JobName = S.JobName
        WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
        WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
      `);
      metrics.duration.watermarkUpdateMs = performance.now() - tWMU0;

      const tCommit0 = performance.now();
      await tx.commit();
      metrics.duration.commitMs = performance.now() - tCommit0;
      metrics.duration.totalMs = performance.now() - t0;

      logMetrics(metrics);
      return metrics;
    }

    const fromUTC = new Date(lastSync.getTime() - SAFETY_LAG_MS);

    metrics.watermarkFrom = fromUTC.toISOString();
    metrics.watermarkTo = nowUTC.toISOString();

    const fromSAPLocal = toZonedTime(fromUTC, SAP_SERVER_TIMEZONE);
    const nowSAPLocal = toZonedTime(nowUTC, SAP_SERVER_TIMEZONE);

    const tChanged0 = performance.now();
    const changedReq = new sql.Request(sapPool);

    changedReq.input('from', sql.DateTime, fromSAPLocal);
    changedReq.input('to', sql.DateTime, nowSAPLocal);

    const changedRes = await changedReq.query(`
            WITH ItemEvents AS (
                -- Eventos de ACTUALIZACIÓN de ítems existentes
                SELECT
                    ItemCode = i.ItemCode COLLATE ${DEST_COLLATION},
                    EventDT = DATEADD(SECOND,
                        ((i.UpdateTS / 10000) * 3600) + (((i.UpdateTS % 10000) / 100) * 60) + (i.UpdateTS % 100),
                        CAST(i.UpdateDate AS DATETIME))
                FROM OITM i
                WHERE
                    DATEADD(SECOND,
                        ((i.UpdateTS / 10000) * 3600) + (((i.UpdateTS % 10000) / 100) * 60) + (i.UpdateTS % 100),
                        CAST(i.UpdateDate AS DATETIME)) > @from
                    AND DATEADD(SECOND,
                        ((i.UpdateTS / 10000) * 3600) + (((i.UpdateTS % 10000) / 100) * 60) + (i.UpdateTS % 100),
                        CAST(i.UpdateDate AS DATETIME)) <= @to

                UNION ALL

                -- Eventos de CREACIÓN de ítems nuevos
                SELECT
                    ItemCode = i.ItemCode COLLATE ${DEST_COLLATION},
                    EventDT = DATEADD(SECOND,
                        ((i.CreateTS / 10000) * 3600) + (((i.CreateTS % 10000) / 100) * 60) + (i.CreateTS % 100),
                        CAST(i.CreateDate AS DATETIME))
                FROM OITM i
                WHERE
                    DATEADD(SECOND,
                        ((i.CreateTS / 10000) * 3600) + (((i.CreateTS % 10000) / 100) * 60) + (i.CreateTS % 100),
                        CAST(i.CreateDate AS DATETIME)) > @from
                    AND DATEADD(SECOND,
                        ((i.CreateTS / 10000) * 3600) + (((i.CreateTS % 10000) / 100) * 60) + (i.CreateTS % 100),
                        CAST(i.CreateDate AS DATETIME)) <= @to

              UNION ALL

            -- Eventos de ACTUALIZACIÓN de precios en [@CAMBIOT3] para la lista T3
            SELECT
                ItemCode = c.Code COLLATE ${DEST_COLLATION},
                EventDT = CASE
                            WHEN c.U_Hora IS NOT NULL THEN
                                DATEADD(SECOND,
                                    (CAST(SUBSTRING(c.U_Hora, 1, 2) AS INT) * 3600) +
                                    (CAST(SUBSTRING(c.U_Hora, 4, 2) AS INT) * 60) +
                                    CAST(SUBSTRING(c.U_Hora, 7, 2) AS INT),
                                    CAST(c.U_Fecha AS DATETIME)
                                )
                            ELSE
                                CAST(c.U_Fecha AS DATETIME) -- Si U_Hora es NULL, solo toma la fecha (hora 00:00:00)
                          END
            FROM [@CAMBIOT3] c
            WHERE
                c.U_Fecha IS NOT NULL -- La fecha SI O SI no debe ser NULL
                AND CASE
                        WHEN c.U_Hora IS NOT NULL THEN
                            DATEADD(SECOND,
                                (CAST(SUBSTRING(c.U_Hora, 1, 2) AS INT) * 3600) +
                                (CAST(SUBSTRING(c.U_Hora, 4, 2) AS INT) * 60) +
                                CAST(SUBSTRING(c.U_Hora, 7, 2) AS INT),
                                CAST(c.U_Fecha AS DATETIME)
                            )
                        ELSE
                            CAST(c.U_Fecha AS DATETIME)
                      END > @from
                AND CASE
                        WHEN c.U_Hora IS NOT NULL THEN
                            DATEADD(SECOND,
                                (CAST(SUBSTRING(c.U_Hora, 1, 2) AS INT) * 3600) +
                                (CAST(SUBSTRING(c.U_Hora, 4, 2) AS INT) * 60) +
                                CAST(SUBSTRING(c.U_Hora, 7, 2) AS INT),
                                CAST(c.U_Fecha AS DATETIME)
                            )
                        ELSE
                            CAST(c.U_Fecha AS DATETIME)
                      END <= @to
                AND c.U_Lista = 'T3'
            )
            SELECT DISTINCT ItemCode FROM ItemEvents;
        `);
    metrics.duration.changedItemsMs = performance.now() - tChanged0;

    const changedItems = changedRes.recordset.map(r => r.ItemCode);
    metrics.changedItems = changedItems.length;

    if (!changedItems.length) {
      const tWMU0 = performance.now();
      const upReq = new sql.Request(tx);
      //upReq.input('dt', sql.DateTime, now);
      await upReq.query(`
        MERGE dbo.SyncMeta AS T
        USING (SELECT 'PriceSync_OITM' AS JobName, GETUTCDATE() AS LastSyncDT) AS S
          ON T.JobName = S.JobName
        WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
        WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
      `);
      metrics.duration.watermarkUpdateMs = performance.now() - tWMU0;

      const tCommit0 = performance.now();
      await tx.commit();
      metrics.duration.commitMs = performance.now() - tCommit0;
      metrics.duration.totalMs = performance.now() - t0;

      logMetrics(metrics);
      return metrics;
    }

    const batches = [];
    for (let i = 0; i < changedItems.length; i += BATCH_SIZE) {
      batches.push(changedItems.slice(i, i + BATCH_SIZE));
    }
    metrics.batches = batches.length;

    for (let b = 0; b < batches.length; b++) {
      const codes = batches[b];
      const priceReq = new sql.Request(sapPool);
      codes.forEach((code, idx) =>
        priceReq.input('code' + idx, sql.NVarChar(50), code)
      );
      const inList = codes.map((_, idx) => '@code' + idx).join(',');

      const tFetchB0 = performance.now();
      /* const priceRes = await priceReq.query(`
        SELECT 
          ItemCode = ItemCode COLLATE ${DEST_COLLATION},
          PriceList,
          Price
        FROM ITM1
        WHERE ItemCode IN (${inList})
      `); */

      const priceRes = await priceReq.query(`
        WITH CAMBIO_BASE AS (
        SELECT c.Code AS ItemCode, CAST(1 AS SMALLINT) AS PriceList,
              CAST(c.U_Fecha AS DATETIME) AS EventDTLocal
        FROM [@CAMBIO] c
        WHERE c.U_Fecha IS NOT NULL

        UNION ALL            -- T2 (clon del T1)
        SELECT c.Code, CAST(2 AS SMALLINT),
              CAST(c.U_Fecha AS DATETIME)
        FROM [@CAMBIO] c
        WHERE c.U_Fecha IS NOT NULL
      ),
      CAMBIOT3_BASE AS (     -- T3
        SELECT c.Code AS ItemCode, CAST(3 AS SMALLINT) AS PriceList,
              CASE WHEN c.U_Hora IS NOT NULL THEN DATEADD(SECOND,
                    (CAST(SUBSTRING(c.U_Hora,1,2) AS INT) * 3600) +
                    (CAST(SUBSTRING(c.U_Hora,4,2) AS INT) * 60) +
                    CAST(SUBSTRING(c.U_Hora,7,2) AS INT),
                    CAST(c.U_Fecha AS DATETIME))
                ELSE CAST(c.U_Fecha AS DATETIME) END AS EventDTLocal
        FROM [@CAMBIOT3] c
        WHERE c.U_Fecha IS NOT NULL AND c.U_Lista = 'T3'
      ),
      CAMBIO_LAST AS (
        SELECT ItemCode, PriceList, MAX(EventDTLocal) AS UpdatedSapLocal
        FROM (
          SELECT * FROM CAMBIO_BASE
          UNION ALL
          SELECT * FROM CAMBIOT3_BASE
        ) X
        GROUP BY ItemCode, PriceList
      )
      SELECT 
        ItemCode = i.ItemCode COLLATE ${DEST_COLLATION},
        i.PriceList,
        i.Price,
        UpdatedSapUTC = CAST(cl.UpdatedSapLocal AS DATETIME2)
      FROM ITM1 i
      LEFT JOIN CAMBIO_LAST cl
        ON cl.ItemCode = i.ItemCode AND cl.PriceList = i.PriceList
      WHERE i.ItemCode IN (${inList});
      `)
      const fetchMs = performance.now() - tFetchB0;
      metrics.duration.batchesFetchMs += fetchMs;

      metrics.scannedPrices += priceRes.recordset.length;
      const rows = priceRes.recordset.map(r => ({
        ItemCode: r.ItemCode,
        PriceList: r.PriceList,
        Price: r.Price,
        UpdatedSap: r.UpdatedSapUTC || null
      }));

      const tMergeB0 = performance.now();
      const { inserted, updated } = await bulkMergePricesTx(tx, rows);
      const mergeMs = performance.now() - tMergeB0;
      metrics.duration.batchesMergeMs += mergeMs;

      metrics.inserted += inserted;
      metrics.updated += updated;

      metrics.batchesDetail.push({
        batchIndex: b,
        fetchMs,
        mergeMs,
        rows: priceRes.recordset.length,
        inserted,
        updated
      });
    }

    const tWMU0 = performance.now();
    const wmUpReq = new sql.Request(tx);
    await wmUpReq.query(`
      MERGE dbo.SyncMeta AS T
      USING (SELECT 'PriceSync_OITM' AS JobName, GETUTCDATE() AS LastSyncDT) AS S
        ON T.JobName = S.JobName
      WHEN MATCHED THEN UPDATE SET LastSyncDT = S.LastSyncDT
      WHEN NOT MATCHED THEN INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
    `);
    metrics.duration.watermarkUpdateMs = performance.now() - tWMU0;

    const tCommit0 = performance.now();
    await tx.commit();
    metrics.duration.commitMs = performance.now() - tCommit0;
    metrics.duration.totalMs = performance.now() - t0;

    logMetrics(metrics);
    return metrics;

  } catch (err) {
    try { await tx.rollback(); } catch {}
    metrics.duration.totalMs = performance.now() - t0;
    logMetrics(metrics, true, err);
    throw err;
  }
}

async function bulkMergePricesTx(tx, rows ) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const createReq = new sql.Request(tx);
  await createReq.batch(`
    IF OBJECT_ID('tempdb..#Delta') IS NOT NULL DROP TABLE #Delta;
    CREATE TABLE #Delta (
      ItemCode NVARCHAR(50) COLLATE ${DEST_COLLATION},
      PriceList SMALLINT,
      Price NUMERIC(19,6),
      UpdatedSap DATETIME NULL
    );
  `);

  for (let i = 0; i < rows.length; i += CHUNK_INSERT) {
    const chunk = rows.slice(i, i + CHUNK_INSERT);
    const tvp = new sql.Table('#Delta');
    tvp.create = false;
    tvp.columns.add('ItemCode', sql.NVarChar(50), { nullable: true });
    tvp.columns.add('PriceList', sql.SmallInt, { nullable: true });
    tvp.columns.add('Price', sql.Numeric(19, 6), { nullable: true });
    tvp.columns.add('UpdatedSap', sql.DateTime, { nullable: true });
    chunk.forEach(r => tvp.rows.add(r.ItemCode, r.PriceList, r.Price, r.UpdatedSap || null));
    const bulkReq = new sql.Request(tx);
    await bulkReq.bulk(tvp);
  }

  const mergeReq = new sql.Request(tx);
  const mergeRes = await mergeReq.query(`
    MERGE dbo.ITM1_ListPrice AS T
    USING #Delta AS S
      ON T.ItemCode COLLATE ${DEST_COLLATION} = S.ItemCode COLLATE ${DEST_COLLATION}
     AND T.PriceList = S.PriceList
    WHEN MATCHED AND (T.Price <> S.Price OR (S.UpdatedSap IS NOT NULL AND (T.UpdatedSap IS NULL OR S.UpdatedSap > T.UpdatedSap))) THEN
      UPDATE SET T.Price = S.Price,T.UpdatedSap = CASE
                     WHEN S.UpdatedSap IS NOT NULL
                          AND (T.UpdatedSap IS NULL OR S.UpdatedSap > T.UpdatedSap)
                     THEN S.UpdatedSap
                     ELSE T.UpdatedSap
                   END, T.UpdatedAt = GETUTCDATE()
    WHEN NOT MATCHED THEN
      INSERT (ItemCode, PriceList, Price,  UpdatedSap,CreatedAt)
      VALUES (S.ItemCode, S.PriceList, S.Price, S.UpdatedSap, GETUTCDATE())
    OUTPUT $action AS MergeAction;
  `);

  let inserted = 0, updated = 0;
  mergeRes.recordset.forEach(r => {
    if (r.MergeAction === 'INSERT') inserted++;
    else if (r.MergeAction === 'UPDATE') updated++;
  });

  return { inserted, updated };
}

function logMetrics(m, isError = false, errObj) {
  const out = {
    level: isError ? 'error' : 'info',
    scope: 'PriceSync',
    metrics: m
  };
  if (errObj) out.error = { message: errObj.message, stack: errObj.stack?.split('\n')[0] };
  console.log(JSON.stringify(out));
}

module.exports = { syncPriceList };
