const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

async function listPendingOrders({
  statusIntegration,            // opcional: 0 | 1
  paymentStatusIntegration,     // opcional: 0 | 1
  commerceId,                   // opcional: exact match
  page = 1,
  pageSize = 50,
  sort = 'updatedAt',           // orden por alias expuesto
  direction = 'DESC',
}) {
  await IdServicePoolConnect;

  const dir = String(direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  // usar los ALIAS expuestos en el SELECT:
  const sortableCols = new Set(['updatedAt','insertedAt','createdAt','id','commerceId']);
  const sortCol = sortableCols.has(sort) ? sort : 'updatedAt';

  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(pageSize));
  const limit  = Math.max(1, Number(pageSize));

  // ---- construir condiciones una vez
  const conds = [];
  if (commerceId) conds.push('o.commerceId = @commerceId');

  if (statusIntegration === undefined && paymentStatusIntegration === undefined) {
    // por defecto: OR entre ambos pendientes
    conds.push('(o.statusIntegration = 0 OR o.paymentStatusIntegration = 0)');
  } else {
    if (statusIntegration !== undefined) conds.push('o.statusIntegration = @statusIntegration');
    if (paymentStatusIntegration !== undefined) conds.push('o.paymentStatusIntegration = @paymentStatusIntegration');
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  // ⚠️ Convertimos a hora de Chile solo al LEER (asumiendo que están guardadas en UTC)
  const selectSql = `
    SELECT
      o.id                                   AS [id],
      o.commerceId                           AS [commerceId],
      o.ref_omsOrderId                       AS [omsOrderId],
      o.ref_salesChannelId                   AS [salesChannelId],

      CASE 
        WHEN o.creationDate IS NULL THEN NULL
        ELSE CAST((o.creationDate AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific SA Standard Time' AS datetime2(3))
      END                                     AS [createdAt],

      -- etiquetas legibles
      CASE 
        WHEN ISNULL(o.statusIntegration, 0) = 1 THEN N'completado'
        WHEN ISNULL(o.statusIntegration, 0) = 0 THEN N'pendiente'
        ELSE N'desconocido'
      END                                     AS [omsStatus],

      o.errorIntegration                      AS [omsError],
      o.source                                AS [source],

      CASE 
        WHEN o.insertedAt IS NULL THEN NULL
        ELSE CAST((o.insertedAt AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific SA Standard Time' AS datetime2(3))
      END                                     AS [insertedAt],

      CASE 
        WHEN o.updatedAt IS NULL THEN NULL
        ELSE CAST((o.updatedAt AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific SA Standard Time' AS datetime2(3))
      END                                     AS [updatedAt],

      CASE 
        WHEN ISNULL(o.paymentStatusIntegration, 0) = 1 THEN N'completado'
        WHEN ISNULL(o.paymentStatusIntegration, 0) = 0 THEN N'pendiente'
        ELSE N'desconocido'
      END                                     AS [financeStatus],

      o.paymentErrorIntegration               AS [financeError]
    FROM dbo.Orders o
    ${where}
    ORDER BY ${sortCol} ${dir}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `;

  const countSql = `
    SELECT COUNT(1) AS total
    FROM dbo.Orders o
    ${where};
  `;

  const dataReq = new sql.Request(IdServicePool)
    .input('offset', sql.Int, offset)
    .input('limit',  sql.Int, limit);

  if (commerceId) dataReq.input('commerceId', sql.NVarChar(200), String(commerceId));
  if (statusIntegration !== undefined) dataReq.input('statusIntegration', sql.Int, Number(statusIntegration));
  if (paymentStatusIntegration !== undefined) dataReq.input('paymentStatusIntegration', sql.Int, Number(paymentStatusIntegration));

  // ---- Request para COUNT (sin offset/limit)
  const countReq = new sql.Request(IdServicePool);
  if (commerceId) countReq.input('commerceId', sql.NVarChar(200), String(commerceId));
  if (statusIntegration !== undefined) countReq.input('statusIntegration', sql.Int, Number(statusIntegration));
  if (paymentStatusIntegration !== undefined) countReq.input('paymentStatusIntegration', sql.Int, Number(paymentStatusIntegration));

  const [rows, countResult] = await Promise.all([
    dataReq.query(selectSql),
    countReq.query(countSql),
  ]);

  const total = Number(countResult.recordset[0]?.total ?? 0);
  return {
    data: rows.recordset,
    page: Number(page),
    pageSize: Number(pageSize),
    total,
    hasNextPage: offset + limit < total,
  };
}
async function findOrderByCommerceId(commerceId) {
  await IdServicePoolConnect;
  const row = (await new sql.Request(IdServicePool)
    .input('commerceId', sql.NVarChar(200), commerceId)
    .query(`
      SELECT TOP(1)
        id,
        commerceId,
        ref_omsOrderId,
        statusIntegration,
        errorIntegration,
        paymentStatusIntegration,
        paymentErrorIntegration,
        creationDate,
        insertedAt,
        updatedAt
      FROM dbo.Orders
      WHERE commerceId = @commerceId
      ORDER BY id DESC
    `)
  ).recordset[0];
  return row || null;
}

async function updateOrderWithOmsId(orderPkId, omsOrderId) {
  await IdServicePoolConnect;
  await new sql.Request(IdServicePool)
    .input('orderPkId', sql.Int, orderPkId)
    .input('omsOrderId', sql.NVarChar(100), String(omsOrderId))
    .query(`
      UPDATE dbo.Orders
         SET ref_omsOrderId    = @omsOrderId,
             statusIntegration = 1,
             updatedAt = CAST((SYSUTCDATETIME() AT TIME ZONE 'UTC') 
                        AT TIME ZONE 'Pacific SA Standard Time' AS datetime2(3))
       WHERE id = @orderPkId;
    `);
}

async function setOrderErrorIntegration(orderPkId, errorText) {
  await IdServicePoolConnect;
  const text = errorText == null ? null : String(errorText).slice(0, 512);
  await new sql.Request(IdServicePool)
    .input('orderPkId', sql.Int, orderPkId)
    .input('err', sql.NVarChar(512), text)
    .query(`
      UPDATE dbo.Orders
         SET errorIntegration = @err,
             updatedAt = CAST((SYSUTCDATETIME() AT TIME ZONE 'UTC') 
                        AT TIME ZONE 'Pacific SA Standard Time' AS datetime2(3))
       WHERE id = @orderPkId;
    `);
}

async function markPaymentQueued(orderPkId) {
  await IdServicePoolConnect;
  await new sql.Request(IdServicePool)
    .input('orderPkId', sql.Int, orderPkId)
    .query(`
      UPDATE dbo.Orders
         SET paymentStatusIntegration = 0,
             paymentErrorIntegration  = NULL,
             updatedAt = CAST((SYSUTCDATETIME() AT TIME ZONE 'UTC') 
                        AT TIME ZONE 'Pacific SA Standard Time' AS datetime2(3))
       WHERE id = @orderPkId;
    `);
}

async function markPaymentOk(orderPkId) {
  await IdServicePoolConnect;
  await new sql.Request(IdServicePool)
    .input('orderPkId', sql.Int, orderPkId)
    .query(`
      UPDATE dbo.Orders
         SET paymentStatusIntegration = 1,
             paymentErrorIntegration  = NULL,
             updatedAt = CAST((SYSUTCDATETIME() AT TIME ZONE 'UTC') 
                        AT TIME ZONE 'Pacific SA Standard Time' AS datetime2(3))
       WHERE id = @orderPkId;
    `);
}

async function markPaymentFailed(orderPkId, errorText) {
  await IdServicePoolConnect;
  const text = errorText == null ? null : String(errorText).slice(0, 500);
  await new sql.Request(IdServicePool)
    .input('orderPkId', sql.Int, orderPkId)
    .input('err', sql.NVarChar(500), text)
    .query(`
      UPDATE dbo.Orders
         SET paymentStatusIntegration = 0,
             paymentErrorIntegration  = @err,
             updatedAt = CAST((SYSUTCDATETIME() AT TIME ZONE 'UTC') 
                        AT TIME ZONE 'Pacific SA Standard Time' AS datetime2(3))
       WHERE id = @orderPkId;
    `);
}

module.exports = {
  listPendingOrders,
  findOrderByCommerceId,
  updateOrderWithOmsId,
  setOrderErrorIntegration,
  markPaymentQueued,
  markPaymentOk,
  markPaymentFailed,
};
