// src/models/repository.js
import { getPool, sql } from '../db/connection.js';

// Helpers para leer campos del JSON MV
const toDateOr = (v, def = null) => (v ? new Date(v) : def);

export async function persistOrder(mvOrder) {
  const pool = await getPool();

  // 🆔 Identificadores principales
  const ref_multivendeId =
    mvOrder?.CheckoutId || mvOrder?._id || null; // id nativo MV
  const uRef1 =
    mvOrder?.CheckoutLinks?.[0]?.externalOrderNumber || mvOrder?.code || null;

  // 📅 Fechas desde Multivende
  const createdAtMV = toDateOr(mvOrder?.createdAt, new Date());
  const soldAtMV = toDateOr(mvOrder?.soldAt, null);
  const updatedAtMV = toDateOr(mvOrder?.updatedAt, null);
  const modifiedAtDB = new Date();

  console.log(
    `[DB] Insertando/actualizando orden MV=${ref_multivendeId} (${uRef1 || 'sin código'})`
  );
  console.log(
    `→ createdAtMV=${createdAtMV.toISOString()} soldAtMV=${
      soldAtMV?.toISOString() || '—'
    } updatedAtMV=${updatedAtMV?.toISOString() || '—'}`
  );

  // 🧩 Idempotencia: si ya existe, se actualiza
  const existing = await pool
    .request()
    .input('ref_multivendeId', sql.NVarChar(50), ref_multivendeId)
    .query(`
      SELECT TOP 1 id
      FROM dbo.Orders
      WHERE ref_multivendeId = @ref_multivendeId;
    `);

  if (existing.recordset.length) {
    const orderId = existing.recordset[0].id;

    await pool
      .request()
      .input('orderId', sql.UniqueIdentifier, orderId)
      .input(
        'ref_salesChannelId',
        sql.NVarChar(20),
        mvOrder?.MarketplaceConnection?.provider || null
      )
      .input('createdAt', sql.DateTime2, createdAtMV)
      .input('soldAt', sql.DateTime2, soldAtMV)
      .input('updatedAt', sql.DateTime2, updatedAtMV)
      .input('rawData', sql.NVarChar(sql.MAX), JSON.stringify(mvOrder))
      .query(`
        UPDATE dbo.Orders
           SET ref_salesChannelId = @ref_salesChannelId,
               createdAt         = @createdAt,
               soldAt            = @soldAt,
               updatedAt         = @updatedAt,
               modifiedAt        = SYSDATETIME(),
               rawData           = @rawData
         WHERE id = @orderId;
      `);

    return orderId;
  }

  // 🆕 Si no existe, insertar nuevo registro
  const result = await pool
    .request()
    .input('ref_multivendeId', sql.NVarChar(50), ref_multivendeId)
    .input(
      'ref_salesChannelId',
      sql.NVarChar(20),
      mvOrder?.MarketplaceConnection?.provider || null
    )
    .input('source', sql.NVarChar(20), 'multivende')
    .input('userCreated', sql.NVarChar(50), 'multivende-webhook')
    .input('statusIntegration', sql.NVarChar(20), 'pending')
    .input('createdAt', sql.DateTime2, createdAtMV)
    .input('soldAt', sql.DateTime2, soldAtMV)
    .input('modifiedAt', sql.DateTime2, modifiedAtDB)
    .input('updatedAt', sql.DateTime2, updatedAtMV)
    .input('rawData', sql.NVarChar(sql.MAX), JSON.stringify(mvOrder))
    .query(`
      INSERT INTO dbo.Orders (
        ref_multivendeId,
        ref_salesChannelId,
        source,
        userCreated,
        statusIntegration,
        createdAt,
        soldAt,
        modifiedAt,
        updatedAt,
        rawData
      )
      OUTPUT inserted.id
      VALUES (
        @ref_multivendeId,
        @ref_salesChannelId,
        @source,
        @userCreated,
        @statusIntegration,
        @createdAt,
        @soldAt,
        @modifiedAt,
        @updatedAt,
        @rawData
      );
    `);

  return result.recordset[0].id;
}

export async function persistStatuses(orderId, mv) {
  const pool = await getPool();

  const states = [
    ['paymentStatus', mv?.paymentStatus],
    ['deliveryStatus', mv?.deliveryStatus],
    ['verificationStatus', mv?.verificationStatus],
  ].filter(([, v]) => v);

  const dateCreated = toDateOr(mv?.createdAt, toDateOr(mv?.soldAt, new Date()));
  const dateModified = toDateOr(mv?.updatedAt, new Date());

  for (const [state, status] of states) {
    await pool
      .request()
      .input('orderId', sql.UniqueIdentifier, orderId)
      .input('state', sql.NVarChar(50), state)
      .input('status', sql.NVarChar(50), status)
      .input('dateCreated', sql.DateTime2, dateCreated)
      .input('dateModified', sql.DateTime2, dateModified)
      .query(`
        INSERT INTO dbo.OrderStatusChange (id, orderId, source, state, status, dateCreated, dateModified)
        VALUES (NEWID(), @orderId, N'multivende', @state, @status, @dateCreated, @dateModified);
      `);
  }
}

export async function persistReceipt(orderId, mv) {
  const link = mv?.CheckoutLinks?.[0] || {};
  const docNumber = link?.externalOrderNumber || mv?.code || null;
  if (!docNumber) return;

  const pool = await getPool();
  const date = toDateOr(mv?.soldAt, new Date());

  await pool
    .request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .input('docNumber', sql.NVarChar(100), docNumber)
    .input('date', sql.DateTime2, date)
    .query(`
      INSERT INTO dbo.OrderReceipts (id, orderId, docNumber, [type], [date])
      VALUES (NEWID(), @orderId, @docNumber, N'order', @date);
    `);
}

export async function saveOmsPayload(orderId, payload) {
  const pool = await getPool();
  await pool
    .request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .query(`
      UPDATE dbo.Orders
         SET omsPayload = @payload,
             modifiedAt = SYSDATETIME()
       WHERE id = @orderId;
    `);
}

export async function saveOmsResponse(orderId, response) {
  const pool = await getPool();
  await pool
    .request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .input('resp', sql.NVarChar(sql.MAX), JSON.stringify(response))
    .query(`
      UPDATE dbo.Orders
         SET omsResponse = @resp,
             modifiedAt = SYSDATETIME()
       WHERE id = @orderId;
    `);
}

export async function setSent(orderId, omsId) {
  const pool = await getPool();
  await pool
    .request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .input('omsId', sql.UniqueIdentifier, omsId)
    .query(`
      UPDATE dbo.Orders
         SET ref_omsOrderId = @omsId,
             statusIntegration = N'sent',
             errorIntegration = NULL,
             modifiedAt = SYSDATETIME()
       WHERE id = @orderId;
    `);
}

export async function setError(orderId, msg) {
  const pool = await getPool();
  await pool
    .request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .input('msg', sql.NVarChar(4000), (msg || 'unknown').slice(0, 4000))
    .query(`
      UPDATE dbo.Orders
         SET statusIntegration = N'error',
             errorIntegration = @msg,
             modifiedAt = SYSDATETIME()
       WHERE id = @orderId;
    `);
}

export async function findByURef1(uRef1) {
  const pool = await getPool();
  const res = await pool
    .request()
    .input('uRef1', sql.NVarChar(100), uRef1)
    .query(`
      SELECT TOP 1 o.*
        FROM dbo.OrderReceipts r
        JOIN dbo.Orders o ON o.id = r.orderId
       WHERE r.docNumber = @uRef1
         AND r.[type] = N'order'
       ORDER BY r.[date] DESC;
    `);
  return res.recordset[0] || null;
}

export async function findById(orderId) {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .input('id', sql.UniqueIdentifier, orderId)
    .query(`
      SELECT TOP 1 *
      FROM dbo.Orders
      WHERE ref_multivendeId = @id
    `);
  return recordset?.[0] || null;
}

// (opcional) buscar por el id nativo de Multivende (CheckoutId)
export async function findByRefMultivendeId(refId) {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .input('refId', sql.NVarChar(50), refId)
    .query(`
      SELECT TOP 1 *
      FROM dbo.Orders
      WHERE ref_multivendeId = @refId
    `);
  return recordset?.[0] || null;
}


export async function setPaymentSent(orderId) {
  const pool = await getPool();
  await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`
      UPDATE dbo.Orders
         SET paymentStatusIntegration = N'sent',
             paymentErrorIntegration = NULL,
             modifiedAt = SYSDATETIME()
       WHERE id = @orderId;
    `);
}

export async function setPaymentError(orderId, msg) {
  const pool = await getPool();
  await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .input('msg', sql.NVarChar(4000), (msg || 'unknown').slice(0, 4000))
    .query(`
      UPDATE dbo.Orders
         SET paymentStatusIntegration = N'error',
             paymentErrorIntegration = @msg,
             modifiedAt = SYSDATETIME()
       WHERE id = @orderId;
    `);
}

export async function saveFinancePayload(orderId, payload) {
  const pool = await getPool();
  await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .query(`
      UPDATE dbo.Orders
         SET financePayload = @payload,
             modifiedAt = SYSDATETIME()
       WHERE id = @orderId;
    `);
}