// src/workers/retryWorker.js
import cron from 'node-cron';
import sql from 'mssql';
import { logger } from '../utils/logger.js';
import { processOrder } from '../services/orderProcessor.js';
import { getPool } from '../db/connection.js';

const MAX_RETRY = Number(process.env.RETRY_MAX_ATTEMPTS || 10);
const CRON_EXPR = process.env.RETRY_CRON_EXPR || '* * * * *';
let task;

export function startRetryWorker() {
  if (task) return;
  logger.info(`[RETRY-WORKER] Iniciando cron (${CRON_EXPR}), MAX_RETRY=${MAX_RETRY}`);

  task = cron.schedule(CRON_EXPR, async () => {
    logger.info('[RETRY-WORKER] Ejecutando retry de órdenes con error...');

    let pool;
    try {
      pool = getPool?.() || await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        server: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
      });

      const result = await pool.request()
        .input('maxRetry', sql.Int, MAX_RETRY)
        .query(`
          SELECT TOP 20
            id,
            JSON_VALUE(omsPayload, '$.u_ref1') AS uRef1,
            ISNULL(retryCount, 0) AS retryCount
          FROM dbo.Orders
          WHERE statusIntegration = 'error'
            AND (retryCount < @maxRetry OR retryCount IS NULL)
          ORDER BY modifiedAt ASC
        `);

      const orders = result.recordset || [];
      if (orders.length === 0) {
        logger.debug('[RETRY-WORKER] No hay órdenes con error pendientes.');
        return;
      }

      for (const order of orders) {
        const intento = (order.retryCount ?? 0) + 1;
        const uRef1 = order.uRef1; // 👈 usa el alias correcto

        try {
          logger.info(`[RETRY] Reprocesando id=${order.id} u_ref1=${uRef1 ?? '-'} intento=${intento}`);

          // 👇 pásale ambos valores a processOrder
          await processOrder({ id: order.id, uRef1 });

          await pool.request()
            .input('id', sql.UniqueIdentifier, order.id)
            .query(`
              UPDATE dbo.Orders
              SET statusIntegration = 'sent',
                  retryCount = ISNULL(retryCount, 0) + 1,
                  lastRetryAt = GETDATE(),
                  lastRetryError = NULL
              WHERE id = @id
            `);

          logger.info(`[RETRY] OK id=${order.id}`);
        } catch (err) {
          logger.error(`[RETRY ERROR] id=${order.id} u_ref1=${uRef1 ?? '-'} msg=${err.message}`);

          await pool.request()
            .input('id', sql.UniqueIdentifier, order.id)
            .input('msg', sql.NVarChar, (err.message || '').substring(0, 4000))
            .query(`
              UPDATE dbo.Orders
              SET retryCount = ISNULL(retryCount, 0) + 1,
                  lastRetryAt = GETDATE(),
                  lastRetryError = @msg
              WHERE id = @id
            `);
        }
      }
    } catch (e) {
      logger.error(`[RETRY-WORKER CRON ERROR] ${e.message}`);
    }
  }, { scheduled: false });

  task.start();
  logger.info('[RETRY-WORKER] Cron iniciado.');
}

export function stopRetryWorker() {
  if (task) {
    task.stop();
    task = undefined;
    logger.info('[RETRY-WORKER] Cron detenido.');
  }
}
