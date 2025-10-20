import cron from 'node-cron';
import { getPool, sql } from '../db/connection.js';
import { scheduleRetry } from './retry.js';

/**
 * Lógica para revisar pedidos con error y reintentarlos
 */
async function checkFailedOrders() {
  try {
    const pool = await getPool();

    const { recordset } = await pool.request().query(`
      SELECT TOP 20 uRef1, retryCount
      FROM dbo.MvOrders
      WHERE statusIntegration = 'error'
        AND (retryCount IS NULL OR retryCount < 10)
        AND (nextRetryAt IS NULL OR nextRetryAt < SYSDATETIME())
      ORDER BY updatedAt DESC;
    `);

    if (!recordset.length) {
      console.log('[CRON] No hay órdenes pendientes de reintento.');
      return;
    }

    for (const row of recordset) {
      console.log(`[CRON] Reintentando orden ${row.uRef1} (intento #${(row.retryCount || 0) + 1})`);
      await pool.request().query(`
        UPDATE dbo.MvOrders
        SET retryCount = ISNULL(retryCount, 0) + 1,
            nextRetryAt = DATEADD(MINUTE, POWER(2, retryCount), SYSDATETIME())
        WHERE uRef1 = '${row.uRef1}';
      `);
      scheduleRetry(row.uRef1, (row.retryCount || 0) + 1);
    }
  } catch (err) {
    console.error('[CRON ERROR]', err.message);
  }
}

/**
 * Inicia el cron job (cada 5 minutos)
 */
export function startRetryCron() {
  console.log('[CRON] Retry automático activado (cada 5 min)');
  cron.schedule('*/5 * * * *', checkFailedOrders); // cada 5 minutos
}
