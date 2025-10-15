const { FinanceServicePool, FinanceServicePoolConnect, sql } = require('../config/db');

// Helpers de errores duplicados (idempotencia)
const isDupKey = (e) => e && (e.number === 2601 || e.number === 2627);

async function savePaymentIntake(dto) {
  if (!dto || !dto.orderId) {
    const err = new Error('ORDER_ID_REQUIRED');
    err.statusCode = 400;
    throw err;
  }

  await FinanceServicePoolConnect;

  // 1) Intake (append-only) con idempotencia por (orderId, idempotencyKey)
  const req = FinanceServicePool.request()
    .input('orderId',         sql.NVarChar(100), dto.orderId)
    .input('idempotencyKey',  sql.NVarChar(100), dto.idempotencyKey || null)
    .input('acquirer',        sql.NVarChar(80),  dto.payments?.acquirer || null)
    .input('message',         sql.NVarChar(200), dto.payments?.message || null)
    .input('installments',    sql.Int,           Number(dto.payments?.installments) || null)
    .input('tid',             sql.NVarChar(80),  dto.payments?.tid || null)
    .input('last4',           sql.NVarChar(8),   dto.payments?.last4 || null)
    .input('valueCents',      sql.BigInt,        Number(dto.payments?.valueCents) || null)
    .input('paymentSystem',   sql.NVarChar(40),  dto.payments?.paymentSystem || null)
    .input('paymentSystemName', sql.NVarChar(80), dto.payments?.paymentSystemName || null)
    .input('raw',             sql.NVarChar(sql.MAX), JSON.stringify(dto));

  try {
    await req.query(`
      INSERT INTO dbo.FinancePaymentIntake
        (orderId, idempotencyKey, acquirer, message, installments, tid, last4, valueCents,
         paymentSystem, paymentSystemName, rawPayload)
      VALUES
        (@orderId, @idempotencyKey, @acquirer, @message, @installments, @tid, @last4, @valueCents,
         @paymentSystem, @paymentSystemName, @raw);
    `);
  } catch (e) {
    if (!isDupKey(e)) throw e; // si es dup, idempotencia OK y seguimos
  }

  // 2) Upsert estado (si no existe: queued; si existe, solo toca updatedAt)
  await FinanceServicePool.request()
    .input('orderId', sql.NVarChar(100), dto.orderId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.FinanceOrderState WHERE orderId = @orderId)
        INSERT INTO dbo.FinanceOrderState(orderId, status) VALUES (@orderId, 'queued');
      ELSE
        UPDATE dbo.FinanceOrderState
          SET updatedAt = SYSUTCDATETIME()
        WHERE orderId = @orderId;
    `);

  return { orderId: dto.orderId };
}

/* Marcadores de estado para worker interno de finanzas */
async function markProcessing(orderId) {
  await FinanceServicePoolConnect;
  await FinanceServicePool.request()
    .input('orderId', sql.NVarChar(100), orderId)
    .query(`
      UPDATE dbo.FinanceOrderState
      SET status = 'processing',
          tries = tries + 1,
          lastAttemptAt = SYSUTCDATETIME(),
          updatedAt = SYSUTCDATETIME(),
          lastError = NULL
      WHERE orderId = @orderId;
    `);
}

async function markDone(orderId, { invoiceDocEntry=null, invoiceDocNum=null, invoiceDocTotal=null, payDocEntry=null, payDocNum=null } = {}) {
  await FinanceServicePoolConnect;
  const r = FinanceServicePool.request()
    .input('orderId',        sql.NVarChar(100), orderId)
    .input('invEntry',       sql.Int,           invoiceDocEntry)
    .input('invNum',         sql.Int,           invoiceDocNum)
    .input('invTotal',       sql.Decimal(18,2), invoiceDocTotal)
    .input('payEntry',       sql.Int,           payDocEntry)
    .input('payNum',         sql.Int,           payDocNum);

  await r.query(`
    UPDATE dbo.FinanceOrderState
    SET status = 'done',
        invoiceDocEntry = @invEntry,
        invoiceDocNum   = @invNum,
        invoiceDocTotal = @invTotal,
        payDocEntry     = @payEntry,
        payDocNum       = @payNum,
        updatedAt       = SYSUTCDATETIME(),
        lastError       = NULL
    WHERE orderId = @orderId;
  `);
}

async function markFailed(orderId, errMsg) {
  await FinanceServicePoolConnect;
  await FinanceServicePool.request()
    .input('orderId', sql.NVarChar(100), orderId)
    .input('err',     sql.NVarChar(1000), (errMsg || '').toString().slice(0,1000))
    .query(`
      UPDATE dbo.FinanceOrderState
      SET status = 'failed',
          lastError = @err,
          updatedAt = SYSUTCDATETIME()
      WHERE orderId = @orderId;
    `);
}

async function getState(orderId) {
  await FinanceServicePoolConnect;
  const { recordset } = await FinanceServicePool.request()
    .input('orderId', sql.NVarChar(100), orderId)
    .query(`
      SELECT TOP 1 *
      FROM dbo.FinanceOrderState
      WHERE orderId = @orderId;
    `);
  return recordset[0] || null;
}


async function getPayment(orderId) {
  await FinanceServicePoolConnect;
  const { recordset } = await FinanceServicePool.request()
    .input('orderId', sql.NVarChar(100), orderId)
    .query(`
      SELECT *
      FROM dbo.FinancePaymentIntake
      WHERE orderId = @orderId;
    `);
  return recordset[0] || null;
}

async function getPaymentIntakeByOrderId(orderId) {
  if (!orderId) {
    const err = new Error('ORDER_ID_REQUIRED');
    err.statusCode = 400;
    throw err;
  }

  await FinanceServicePoolConnect;

  const r = await FinanceServicePool.request()
    .input('orderId', sql.NVarChar(100), orderId)
    .query(`
      SELECT TOP 1
        id, orderId, idempotencyKey, acquirer, message, installments, tid, last4,
        valueCents, paymentSystem, paymentSystemName, receivedAt, rawPayload
      FROM dbo.FinancePaymentIntake WITH (NOLOCK)
      WHERE orderId = @orderId
      ORDER BY receivedAt DESC;
    `);

  const row = r.recordset?.[0];
  if (!row) {
    const err = new Error(`INTAKE_NOT_FOUND: ${orderId}`);
    err.code = 'INTAKE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  return {
    id: row.id,
    orderId: row.orderId,
    idempotencyKey: row.idempotencyKey || null,
    acquirer: row.acquirer || '',
    message: row.message || '',
    installments: row.installments != null ? Number(row.installments) : null,
    tid: row.tid ? String(row.tid) : '',
    last4: row.last4 ? String(row.last4) : '',
    valueCents: row.valueCents != null ? Number(row.valueCents) : 0,
    paymentSystem: row.paymentSystem ? String(row.paymentSystem) : '',
    paymentSystemName: row.paymentSystemName || '',
    receivedAt: row.receivedAt,             // Date
    rawPayload: row.rawPayload || null      // string JSON
  };
}

module.exports = {
  savePaymentIntake,
  markProcessing,
  markDone,
  markFailed,
  getState,
  getPaymentIntakeByOrderId,
  getPayment
};
