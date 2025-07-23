const { performance } = require('perf_hooks');
const { sql, sapPool } = require('../config/dbnewsap');
const { catalogPool } = require('../config/dbnew');
const { toZonedTime } = require('date-fns-tz');

// Configuración de sincronización
const BATCH_SIZE = 500;
const CHUNK_INSERT = 1000;
const JOB_NAME = 'OBCD_QR_Sync';
const DEST_COLLATION = 'SQL_Latin1_General_CP850_CI_AS';
const SAP_SERVER_TIMEZONE = 'America/Santiago';

async function syncOBCD() {
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

            const tFull0 = performance.now();
            const sapReq = new sql.Request(sapPool);
            const allRes = await sapReq.query(`
                SELECT 
                    BcdEntry,
                    BcdCode = BcdCode COLLATE ${DEST_COLLATION},
                    ItemCode = ItemCode COLLATE ${DEST_COLLATION},
                    UserSign,
                    UserSign2,
                    UpdateDate,
                    CreateDate
                FROM OBCD
            `);
            metrics.duration.fullLoadFetchMs = performance.now() - tFull0;
            metrics.scannedItems = allRes.recordset.length;

            const tMerge0 = performance.now();
            const { inserted, updated } = await bulkMergeOBCD(tx, allRes.recordset);
            metrics.duration.batchesMergeMs += (performance.now() - tMerge0);
            metrics.inserted = inserted;
            metrics.updated = updated;

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
        metrics.watermarkFrom = lastSync.toISOString();
        metrics.watermarkTo = nowUTC.toISOString();

        const fromSAPLocal = toZonedTime(lastSync, SAP_SERVER_TIMEZONE);

        const tChanged0 = performance.now();
        const changedReq = new sql.Request(sapPool);
        changedReq.input('from', sql.Date, fromSAPLocal);

        // La consulta considera tanto la fecha de actualización como la de creación
        const changedRes = await changedReq.query(`
            SELECT
                BcdEntry,
                BcdCode = BcdCode COLLATE ${DEST_COLLATION},
                ItemCode = ItemCode COLLATE ${DEST_COLLATION},
                UserSign,
                UserSign2,
                UpdateDate,
                CreateDate
            FROM OBCD
            WHERE UpdateDate >= @from OR CreateDate >= @from
        `);
        metrics.duration.changedItemsMs = performance.now() - tChanged0;

        metrics.scannedItems = changedRes.recordset.length;
        
        if (changedRes.recordset.length === 0) {
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

        const tMergeB0 = performance.now();
        const { inserted, updated } = await bulkMergeOBCD(tx, changedRes.recordset);
        const mergeMs = performance.now() - tMergeB0;
        metrics.duration.batchesMergeMs += mergeMs;

        metrics.inserted = inserted;
        metrics.updated = updated;
        metrics.changedItems = inserted + updated;
        metrics.batches = 1;

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

async function bulkMergeOBCD(tx, rows) {
    if (!rows.length) return { inserted: 0, updated: 0 };

    const createReq = new sql.Request(tx);
    await createReq.batch(`
        IF OBJECT_ID('tempdb..#DeltaOBCD') IS NOT NULL DROP TABLE #DeltaOBCD;
        CREATE TABLE #DeltaOBCD (
            BcdEntry    INT NOT NULL,
            BcdCode     NVARCHAR(254),
            ItemCode    NVARCHAR(50),
            UserSign    SMALLINT,
            UserSign2   SMALLINT,
            UpdateDate  DATETIME,
            CreateDate  DATETIME
        );
    `);

    const tvp = new sql.Table('#DeltaOBCD');
    tvp.create = false;

    // Definición de columnas con las restricciones de nulos de tu tabla destino
    tvp.columns.add('BcdEntry', sql.Int, { nullable: false });
    tvp.columns.add('BcdCode', sql.NVarChar(254), { nullable: true });
    tvp.columns.add('ItemCode', sql.NVarChar(50), { nullable: true });
    tvp.columns.add('UserSign', sql.SmallInt, { nullable: true });
    tvp.columns.add('UserSign2', sql.SmallInt, { nullable: true });
    tvp.columns.add('UpdateDate', sql.DateTime, { nullable: true });
    tvp.columns.add('CreateDate', sql.DateTime, { nullable: true });
    
    // Convertir y limpiar los datos antes de agregarlos a la tabla
    const sanitizedRows = rows.map(r => {
        // Aseguramos que BcdEntry no sea nulo, ya que es la única columna NOT NULL
        if (r.BcdEntry === null || r.BcdEntry === undefined) {
            console.error('Error: Valor nulo encontrado en la columna BcdEntry (NOT NULL). Fila omitida:', r);
            return null;
        }

        return {
            BcdEntry: parseInt(r.BcdEntry, 10),
            BcdCode: (r.BcdCode !== null && r.BcdCode !== undefined) ? String(r.BcdCode) : null,
            ItemCode: (r.ItemCode !== null && r.ItemCode !== undefined) ? String(r.ItemCode) : null,
            UserSign: (r.UserSign !== null && r.UserSign !== undefined) ? parseInt(r.UserSign, 10) : null,
            UserSign2: (r.UserSign2 !== null && r.UserSign2 !== undefined) ? parseInt(r.UserSign2, 10) : null,
            UpdateDate: r.UpdateDate,
            CreateDate: r.CreateDate,
        };
    }).filter(r => r !== null);

    sanitizedRows.forEach(r => {
        tvp.rows.add(
            r.BcdEntry,
            r.BcdCode,
            r.ItemCode,
            r.UserSign,
            r.UserSign2,
            r.UpdateDate,
            r.CreateDate
        );
    });

    const bulkReq = new sql.Request(tx);
    await bulkReq.bulk(tvp);

    const mergeReq = new sql.Request(tx);
    const mergeRes = await mergeReq.query(`
        MERGE dbo.OBCD_QR AS T
        USING #DeltaOBCD AS S
        ON T.BcdEntry = S.BcdEntry
        WHEN MATCHED AND (
            T.BcdCode <> S.BcdCode COLLATE ${DEST_COLLATION} OR
            T.ItemCode <> S.ItemCode COLLATE ${DEST_COLLATION} OR
            T.UserSign <> S.UserSign OR
            T.UserSign2 <> S.UserSign2 OR
            T.UpdateDate <> S.UpdateDate OR
            T.CreateDate <> S.CreateDate
        ) THEN
            UPDATE SET
                BcdCode = S.BcdCode,
                ItemCode = S.ItemCode,
                UserSign = S.UserSign,
                UserSign2 = S.UserSign2,
                UpdateDate = S.UpdateDate,
                CreateDate = S.CreateDate
        WHEN NOT MATCHED THEN
            INSERT (
                BcdEntry, BcdCode, ItemCode, UserSign, UserSign2, UpdateDate, CreateDate
            )
            VALUES (
                S.BcdEntry, S.BcdCode, S.ItemCode, S.UserSign, S.UserSign2, S.UpdateDate, S.CreateDate
            )
        OUTPUT $action AS MergeAction;
    `);

    let inserted = 0;
    let updated = 0;
    for (const r of mergeRes.recordset) {
        if (r.MergeAction === 'INSERT') {
            inserted++;
        } else if (r.MergeAction === 'UPDATE') {
            updated++;
        }
    }
    return { inserted, updated };
}

function logMetrics(m, isError = false, errObj) {
    const out = {
        level: isError ? 'error' : 'info',
        scope: 'OBCDSync',
        metrics: m
    };
    if (errObj) out.error = { message: errObj.message, stack: errObj.stack?.split('\n')[0] };
    console.log(JSON.stringify(out));
}

module.exports = { syncOBCD };