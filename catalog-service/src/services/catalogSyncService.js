// services/productSync.js
const { performance } = require('perf_hooks');
const { sql, sapPool } = require('../config/dbnewsap');
const { catalogPool } = require('../config/dbnew');
const { toZonedTime } = require('date-fns-tz');

// Configuración de sincronización
const SAFETY_LAG_MS = 60 * 1000;      
const BATCH_SIZE = 500;             
const CHUNK_INSERT = 1000;          
const JOB_NAME = 'OITM_ProductSync';
const DEST_COLLATION = 'SQL_Latin1_General_CP850_CI_AS'; 
const SAP_SERVER_TIMEZONE = 'America/Santiago'; 
const REFERENCE_TIMEZONE = 'UTC';

async function syncProducts() {
  const t0 = performance.now();

  // 1) Asegurar conexión de pools
  if (!sapPool.connected) await sapPool.connect();
  if (!catalogPool.connected) await catalogPool.connect();

  const tx = new sql.Transaction(catalogPool);
  await tx.begin();

  const metrics = {
    initialLoad: false,
    watermarkFrom: null,
    watermarkTo: null,
    scannedItems: 0,
    changedItems: 0,
    batches: 0,
    inserted: 0,
    updated: 0,
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
    // 2) Leer el último watermark
    const tWM0 = performance.now();
    const wmReq = new sql.Request(tx);
    wmReq.input('job', sql.NVarChar, JOB_NAME);

    const wmRes = await wmReq.query(`
      SELECT LastSyncDT
      FROM dbo.SyncMeta
      WHERE JobName = @job
    `);
    metrics.duration.fetchWatermarkMs = performance.now() - tWM0;
    const lastSync = wmRes.recordset.length
      ? wmRes.recordset[0].LastSyncDT
      : null;

    const nowUTC = new Date(); 

    // 3) Primera ejecución: full load (si no hay watermark previo)
    if (!lastSync) {
      metrics.initialLoad = true;

      // Traer todos los productos desde SAP
      const tFull0 = performance.now();
      const sapReq = new sql.Request(sapPool);
      const allRes = await sapReq.query(`
        SELECT
          ItemCode = ItemCode COLLATE ${DEST_COLLATION},
          ItemName, U_CCosto, SalUnitMsr, U_Marca, U_Categoria, U_Subcategoria,
          U_ValVcto, U_ReqPicking, ValidFor, InvntItem, ItmsGrpCod,
          U_Nombre_Fam, U_Nombre_SubFam, TaxCodeAR, SellItem, U_RPRO,
          CodeBars, InvntryUom, U_PRIMER_NIVEL, U_Imagen,
          CreateDate, CreateTS, UpdateDate, UpdateTS
        FROM OITM
      `);
      metrics.duration.fullLoadFetchMs = performance.now() - tFull0;
      metrics.scannedItems = allRes.recordset.length;

      const tMerge0 = performance.now();
      const { inserted, updated } = await bulkMergeProductsTx(tx, allRes.recordset);
      metrics.duration.batchesMergeMs += (performance.now() - tMerge0);
      metrics.inserted = inserted;
      metrics.updated = updated;

      // Actualizar watermark a ahora (UTC)
      const tWMU0 = performance.now();
      const upReq = new sql.Request(tx);
      upReq.input('job', sql.NVarChar, JOB_NAME);
      await upReq.query(`
        MERGE dbo.SyncMeta AS T
        USING (
          SELECT @job AS JobName, GETUTCDATE() AS LastSyncDT
        ) AS S
          ON T.JobName = S.JobName
        WHEN MATCHED THEN
          UPDATE SET LastSyncDT = S.LastSyncDT
        WHEN NOT MATCHED THEN
          INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
      `);
      metrics.duration.watermarkUpdateMs = performance.now() - tWMU0;

      const tCommit0 = performance.now();
      await tx.commit();
      metrics.duration.commitMs = performance.now() - tCommit0;
      metrics.duration.totalMs = performance.now() - t0;

      logMetrics(metrics);
      return metrics;
    }
    // 4) Carga incremental
    const fromUTC = new Date(lastSync.getTime() - SAFETY_LAG_MS);

    metrics.watermarkFrom = fromUTC.toISOString();
    metrics.watermarkTo = nowUTC.toISOString();

    // Convertir a la zona horaria del servidor SAP para la consulta
    const fromSAPLocal = toZonedTime(fromUTC, SAP_SERVER_TIMEZONE);
    const nowSAPLocal = toZonedTime(nowUTC, SAP_SERVER_TIMEZONE);

    // Identificar los productos actualizados O CREADOS en SAP desde lastSync
    const tChanged0 = performance.now();
    const changedReq = new sql.Request(sapPool);

    changedReq.input('from', sql.DateTime, fromSAPLocal);
    changedReq.input('to', sql.DateTime, nowSAPLocal);

    const changedRes = await changedReq.query(`
      WITH Events AS (
        -- Eventos basados en la fecha/hora de ACTUALIZACIÓN (para ítems existentes modificados)
        SELECT
          ItemCode = i.ItemCode COLLATE ${DEST_COLLATION},
          EventDT = DATEADD(SECOND,
            ((i.UpdateTS / 10000) * 3600) +
            (((i.UpdateTS % 10000) / 100) * 60) +
            (i.UpdateTS % 100),
            CAST(i.UpdateDate AS DATETIME))
        FROM OITM i
        WHERE
            DATEADD(SECOND,
              ((i.UpdateTS / 10000) * 3600) +
              (((i.UpdateTS % 10000) / 100) * 60) +
              (i.UpdateTS % 100),
              CAST(i.UpdateDate AS DATETIME)) > @from
            AND DATEADD(SECOND,
              ((i.UpdateTS / 10000) * 3600) +
              (((i.UpdateTS % 10000) / 100) * 60) +
              (i.UpdateTS % 100),
              CAST(i.UpdateDate AS DATETIME)) <= @to

        UNION ALL

        SELECT
          ItemCode = i.ItemCode COLLATE ${DEST_COLLATION},
          EventDT = DATEADD(SECOND,
            ((i.CreateTS / 10000) * 3600) +
            (((i.CreateTS % 10000) / 100) * 60) +
            (i.CreateTS % 100),
            CAST(i.CreateDate AS DATETIME))
        FROM OITM i
        WHERE
            DATEADD(SECOND,
              ((i.CreateTS / 10000) * 3600) +
              (((i.CreateTS % 10000) / 100) * 60) +
              (i.CreateTS % 100),
              CAST(i.CreateDate AS DATETIME)) > @from
            AND DATEADD(SECOND,
              ((i.CreateTS / 10000) * 3600) +
              (((i.CreateTS % 10000) / 100) * 60) +
              (i.CreateTS % 100),
              CAST(i.CreateDate AS DATETIME)) <= @to
      )
      SELECT DISTINCT ItemCode FROM Events; 
    `);
    metrics.duration.changedItemsMs = performance.now() - tChanged0;

    const changedItems = changedRes.recordset.map(r => r.ItemCode);
    metrics.changedItems = changedItems.length;

    // Si no hay cambios ni creaciones, solo actualizar watermark
    if (changedItems.length === 0) {
      const tWMU0 = performance.now();
      const wmUpReq = new sql.Request(tx);
      wmUpReq.input('job', sql.NVarChar, JOB_NAME);
      await wmUpReq.query(`
        MERGE dbo.SyncMeta AS T
        USING (
          SELECT @job AS JobName, GETUTCDATE() AS LastSyncDT
        ) AS S
          ON T.JobName = S.JobName
        WHEN MATCHED THEN
          UPDATE SET LastSyncDT = S.LastSyncDT
        WHEN NOT MATCHED THEN
          INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
      `);
      metrics.duration.watermarkUpdateMs = performance.now() - tWMU0;

      const tCommit0 = performance.now();
      await tx.commit();
      metrics.duration.commitMs = performance.now() - tCommit0;
      metrics.duration.totalMs = performance.now() - t0;

      logMetrics(metrics);
      return metrics;
    }

    // Partir en batches (grupos de ItemCodes)
    const batches = [];
    for (let i = 0; i < changedItems.length; i += BATCH_SIZE) {
      batches.push(changedItems.slice(i, i + BATCH_SIZE));
    }
    metrics.batches = batches.length;

    // Procesar cada batch: consultar datos completos de SAP y hacer el merge
    for (const codes of batches) {
      const priceReq = new sql.Request(sapPool);
      codes.forEach((code, idx) => {
        priceReq.input(`code${idx}`, sql.NVarChar(50), code);
      });
      const inList = codes.map((_, idx) => `@code${idx}`).join(',');

      const tFetchB0 = performance.now();
      const priceRes = await priceReq.query(`
        SELECT
          ItemCode = ItemCode COLLATE ${DEST_COLLATION},
          ItemName, U_CCosto, SalUnitMsr, U_Marca, U_Categoria, U_Subcategoria,
          U_ValVcto, U_ReqPicking, ValidFor, InvntItem, ItmsGrpCod,
          U_Nombre_Fam, U_Nombre_SubFam, TaxCodeAR, SellItem, U_RPRO,
          CodeBars, InvntryUom, U_PRIMER_NIVEL, U_Imagen,
          CreateDate, CreateTS, UpdateDate, UpdateTS
        FROM OITM
        WHERE ItemCode IN (${inList})
      `);
      const fetchMs = performance.now() - tFetchB0;
      metrics.duration.batchesFetchMs += fetchMs;

      metrics.scannedItems += priceRes.recordset.length;
      const tMergeB0 = performance.now();
      const { inserted, updated } = await bulkMergeProductsTx(tx, priceRes.recordset);
      const mergeMs = performance.now() - tMergeB0;
      metrics.duration.batchesMergeMs += mergeMs;

      metrics.inserted += inserted;
      metrics.updated += updated;
    }

    // Actualizar watermark final
    const tWMU0 = performance.now();
    const wmUpReq = new sql.Request(tx);
    wmUpReq.input('job', sql.NVarChar, JOB_NAME);
    await wmUpReq.query(`
      MERGE dbo.SyncMeta AS T
      USING (
        SELECT @job AS JobName, GETUTCDATE() AS LastSyncDT
      ) AS S
        ON T.JobName = S.JobName
      WHEN MATCHED THEN
        UPDATE SET LastSyncDT = S.LastSyncDT
      WHEN NOT MATCHED THEN
        INSERT (JobName, LastSyncDT) VALUES (S.JobName, S.LastSyncDT);
    `);
    metrics.duration.watermarkUpdateMs = performance.now() - tWMU0;

    const tCommit0 = performance.now();
    await tx.commit();
    metrics.duration.commitMs = performance.now() - tCommit0;
    metrics.duration.totalMs = performance.now() - t0;

    logMetrics(metrics);
    return metrics;

  } catch (err) {
    try {
      await tx.rollback();
    } catch (rollbackErr) {
      console.error('Error during transaction rollback:', rollbackErr);
    }
    metrics.duration.totalMs = performance.now() - t0;
    logMetrics(metrics, true, err);
    throw err;
  }
}

async function bulkMergeProductsTx(tx, rows) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const createReq = new sql.Request(tx);
  // Crear tabla temporal #Delta si no existe
  await createReq.batch(`
    IF OBJECT_ID('tempdb..#Delta') IS NOT NULL DROP TABLE #Delta;
    CREATE TABLE #Delta (
      ItemCode           NVARCHAR(50) COLLATE ${DEST_COLLATION},
      ItemName           NVARCHAR(100),
      U_CCosto           NVARCHAR(10),
      SalUnitMsr         NVARCHAR(100),
      U_Marca            NVARCHAR(30),
      U_Categoria        NVARCHAR(200),
      U_Subcategoria     NVARCHAR(200),
      U_ValVcto          NVARCHAR(10),
      U_ReqPicking       NVARCHAR(10),
      ValidFor           CHAR(1),
      InvntItem          CHAR(1),
      ItmsGrpCod         SMALLINT,
      U_Nombre_Fam       NVARCHAR(50),
      U_Nombre_SubFam    NVARCHAR(50),
      TaxCodeAR          NVARCHAR(8),
      SellItem           CHAR(1),
      U_RPRO             NVARCHAR(10),
      CodeBars           NVARCHAR(254),
      InvntryUom         NVARCHAR(100),
      U_PRIMER_NIVEL     NVARCHAR(200),
      U_Imagen           NVARCHAR(254),
      CreateDate         DATETIME,
      CreateTS           INT,
      UpdateDate         DATETIME,
      UpdateTS           INT
    );
  `);

  // Insertar los datos en #Delta por chunks
  for (let i = 0; i < rows.length; i += CHUNK_INSERT) {
    const chunk = rows.slice(i, i + CHUNK_INSERT);
    const tvp = new sql.Table('#Delta');
    tvp.create = false; // La tabla ya se creó con el batch anterior

    // Definición de columnas para el Table-Valued Parameter (TVP)
    tvp.columns.add('ItemCode', sql.NVarChar(50), { nullable: true });
    tvp.columns.add('ItemName', sql.NVarChar(100), { nullable: true });
    tvp.columns.add('U_CCosto', sql.NVarChar(10), { nullable: true });
    tvp.columns.add('SalUnitMsr', sql.NVarChar(100), { nullable: true });
    tvp.columns.add('U_Marca', sql.NVarChar(30), { nullable: true });
    tvp.columns.add('U_Categoria', sql.NVarChar(200), { nullable: true });
    tvp.columns.add('U_Subcategoria', sql.NVarChar(200), { nullable: true });
    tvp.columns.add('U_ValVcto', sql.NVarChar(10), { nullable: true });
    tvp.columns.add('U_ReqPicking', sql.NVarChar(10), { nullable: true });
    tvp.columns.add('ValidFor', sql.Char(1), { nullable: true });
    tvp.columns.add('InvntItem', sql.Char(1), { nullable: true });
    tvp.columns.add('ItmsGrpCod', sql.SmallInt, { nullable: true });
    tvp.columns.add('U_Nombre_Fam', sql.NVarChar(50), { nullable: true });
    tvp.columns.add('U_Nombre_SubFam', sql.NVarChar(50), { nullable: true });
    tvp.columns.add('TaxCodeAR', sql.NVarChar(8), { nullable: true });
    tvp.columns.add('SellItem', sql.Char(1), { nullable: true });
    tvp.columns.add('U_RPRO', sql.NVarChar(10), { nullable: true });
    tvp.columns.add('CodeBars', sql.NVarChar(254), { nullable: true });
    tvp.columns.add('InvntryUom', sql.NVarChar(100), { nullable: true });
    tvp.columns.add('U_PRIMER_NIVEL', sql.NVarChar(200), { nullable: true });
    tvp.columns.add('U_Imagen', sql.NVarChar(254), { nullable: true });
    tvp.columns.add('CreateDate', sql.DateTime, { nullable: true });
    tvp.columns.add('CreateTS', sql.Int, { nullable: true });
    tvp.columns.add('UpdateDate', sql.DateTime, { nullable: true });
    tvp.columns.add('UpdateTS', sql.Int, { nullable: true });

    chunk.forEach(r => {
      tvp.rows.add(
        r.ItemCode, r.ItemName, r.U_CCosto, r.SalUnitMsr, r.U_Marca, r.U_Categoria,
        r.U_Subcategoria, r.U_ValVcto, r.U_ReqPicking, r.ValidFor, r.InvntItem,
        r.ItmsGrpCod, r.U_Nombre_Fam, r.U_Nombre_SubFam, r.TaxCodeAR, r.SellItem,
        r.U_RPRO, r.CodeBars, r.InvntryUom, r.U_PRIMER_NIVEL, r.U_Imagen,
        r.CreateDate,
        Number.isInteger(r.CreateTS) ? r.CreateTS : null, // Asegura que CreateTS sea un número entero o null
        r.UpdateDate,
        Number.isInteger(r.UpdateTS) ? r.UpdateTS : null // Asegura que UpdateTS sea un número entero o null
      );
    });

    const bulkReq = new sql.Request(tx);
    await bulkReq.bulk(tvp);
  }

  // Realizar el MERGE: Insertar nuevos productos o actualizar existentes
  const mergeReq = new sql.Request(tx);
  const mergeRes = await mergeReq.query(`
    MERGE dbo.OITM_Products AS T
    USING #Delta AS S
      ON T.ItemCode COLLATE ${DEST_COLLATION} = S.ItemCode COLLATE ${DEST_COLLATION}
    WHEN MATCHED AND (

        T.ItemName         <> S.ItemName COLLATE ${DEST_COLLATION} OR
        T.U_CCosto         <> S.U_CCosto COLLATE ${DEST_COLLATION} OR
        T.SalUnitMsr       <> S.SalUnitMsr COLLATE ${DEST_COLLATION} OR
        T.U_Marca          <> S.U_Marca COLLATE ${DEST_COLLATION} OR
        T.U_Categoria      <> S.U_Categoria COLLATE ${DEST_COLLATION} OR
        T.U_Subcategoria   <> S.U_Subcategoria COLLATE ${DEST_COLLATION} OR
        T.U_ValVcto        <> S.U_ValVcto COLLATE ${DEST_COLLATION} OR
        T.U_ReqPicking     <> S.U_ReqPicking COLLATE ${DEST_COLLATION} OR
        T.ValidFor         <> S.ValidFor COLLATE ${DEST_COLLATION} OR
        T.InvntItem        <> S.InvntItem COLLATE ${DEST_COLLATION} OR
        T.ItmsGrpCod       <> S.ItmsGrpCod OR
        T.U_Nombre_Fam     <> S.U_Nombre_Fam COLLATE ${DEST_COLLATION} OR
        T.U_Nombre_SubFam  <> S.U_Nombre_SubFam COLLATE ${DEST_COLLATION} OR
        T.TaxCodeAR        <> S.TaxCodeAR COLLATE ${DEST_COLLATION} OR
        T.SellItem         <> S.SellItem COLLATE ${DEST_COLLATION} OR
        T.U_RPRO           <> S.U_RPRO COLLATE ${DEST_COLLATION} OR
        T.CodeBars         <> S.CodeBars COLLATE ${DEST_COLLATION} OR
        T.InvntryUom       <> S.InvntryUom COLLATE ${DEST_COLLATION} OR
        T.U_PRIMER_NIVEL   <> S.U_PRIMER_NIVEL COLLATE ${DEST_COLLATION} OR
        T.U_Imagen         <> S.U_Imagen COLLATE ${DEST_COLLATION} OR
        T.CreateDate       <> S.CreateDate OR
        T.CreateTS         <> S.CreateTS OR
        T.UpdateDate       <> S.UpdateDate OR
        T.UpdateTS         <> S.UpdateTS
    ) THEN
      UPDATE SET
        ItemName          = S.ItemName,
        U_CCosto          = S.U_CCosto,
        SalUnitMsr        = S.SalUnitMsr,
        U_Marca           = S.U_Marca,
        U_Categoria       = S.U_Categoria,
        U_Subcategoria    = S.U_Subcategoria, 
        U_ValVcto         = S.U_ValVcto,
        U_ReqPicking      = S.U_ReqPicking,
        ValidFor          = S.ValidFor,
        InvntItem         = S.InvntItem,
        ItmsGrpCod        = S.ItmsGrpCod,
        U_Nombre_Fam      = S.U_Nombre_Fam,
        U_Nombre_SubFam   = S.U_Nombre_SubFam,
        TaxCodeAR         = S.TaxCodeAR,
        SellItem          = S.SellItem,
        U_RPRO            = S.U_RPRO,
        CodeBars          = S.CodeBars,
        InvntryUom        = S.InvntryUom,
        U_PRIMER_NIVEL    = S.U_PRIMER_NIVEL,
        U_Imagen          = S.U_Imagen,
        CreateDate        = S.CreateDate,
        CreateTS          = S.CreateTS,
        UpdateDate        = S.UpdateDate,
        UpdateTS          = S.UpdateTS
    WHEN NOT MATCHED THEN
      INSERT (
        ItemCode, ItemName, U_CCosto, SalUnitMsr, U_Marca, U_Categoria,
        U_Subcategoria, U_ValVcto, U_ReqPicking, ValidFor, InvntItem,
        ItmsGrpCod, U_Nombre_Fam, U_Nombre_SubFam, TaxCodeAR, SellItem,
        U_RPRO, CodeBars, InvntryUom, U_PRIMER_NIVEL, U_Imagen,
        CreateDate, CreateTS, UpdateDate, UpdateTS
      )
      VALUES (
        S.ItemCode, S.ItemName, S.U_CCosto, S.SalUnitMsr, S.U_Marca,
        S.U_Categoria, S.U_Subcategoria, S.U_ValVcto, S.U_ReqPicking,
        S.ValidFor, S.InvntItem, S.ItmsGrpCod, S.U_Nombre_Fam,
        S.U_Nombre_SubFam, S.TaxCodeAR, S.SellItem, S.U_RPRO,
        S.CodeBars, S.InvntryUom, S.U_PRIMER_NIVEL, S.U_Imagen,
        S.CreateDate, S.CreateTS, S.UpdateDate, S.UpdateTS
      )
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
    scope: 'ProductSync',
    metrics: m
  };
  if (errObj) out.error = { message: errObj.message, stack: errObj.stack?.split('\n')[0] };
  console.log(JSON.stringify(out));
}

module.exports = { syncProducts };