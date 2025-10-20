import { getPool, sql } from '../config/db.js';

export async function createHold(creditId, { amount, currency='CLP', orderId=null, expiresAt=null, reason=null }) {
  const pool = await getPool();
  const expires = expiresAt ? new Date(expiresAt) : null;

  const res = await pool.request()
    .input('creditId', sql.UniqueIdentifier, creditId)
    .input('amount', sql.Decimal(18,2), amount)
    .input('currency', sql.Char(3), currency)
    .input('orderId', sql.NVarChar(60), orderId)
    .input('expiresAt', sql.DateTime2, expires)
    .input('reason', sql.NVarChar(200), reason)
    .query(`
      INSERT INTO dbo.CreditHolds (creditId, amount, currency, orderId, expiresAt, reason, status)
      OUTPUT inserted.*
      VALUES (@creditId, @amount, @currency, @orderId, @expiresAt, @reason, 'active');
    `);
  return res.recordset[0];
}

// ✅ variante transaccional
export async function createHoldTx(tx, creditId, { amount, currency='CLP', orderId=null, expiresAt=null, reason=null }) {
  const req = new sql.Request(tx);
  const expires = expiresAt ? new Date(expiresAt) : null;

  const res = await req
    .input('creditId', sql.UniqueIdentifier, creditId)
    .input('amount', sql.Decimal(18,2), amount)
    .input('currency', sql.Char(3), currency)
    .input('orderId', sql.NVarChar(60), orderId)
    .input('expiresAt', sql.DateTime2, expires)
    .input('reason', sql.NVarChar(200), reason)
    .query(`
      INSERT INTO dbo.CreditHolds (creditId, amount, currency, orderId, expiresAt, reason, status)
      OUTPUT inserted.*
      VALUES (@creditId, @amount, @currency, @orderId, @expiresAt, @reason, 'active');
    `);
  return res.recordset[0];
}

export async function getHold(holdId) { /* igual que lo tienes */ }
export async function updateHoldStatus(holdId, status) { /* igual que lo tienes */ }
