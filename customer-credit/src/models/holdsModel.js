import { getPool, sql } from '../config/db.js';

export async function createHold(creditId, { amount, currency='CLP', orderId=null, expiresAt=null, reason=null }) {
  const pool = await getPool();
  const res = await pool.request()
    .input('creditId', sql.UniqueIdentifier, creditId)
    .input('amount', sql.Decimal(18,2), amount)
    .input('currency', sql.Char(3), currency)
    .input('orderId', sql.NVarChar(60), orderId)
    .input('expiresAt', sql.DateTime2, expiresAt)
    .input('reason', sql.NVarChar(200), reason)
    .query(`
      INSERT INTO dbo.CreditHolds (creditId, amount, currency, orderId, expiresAt, reason, status)
      OUTPUT inserted.*
      VALUES (@creditId, @amount, @currency, @orderId, @expiresAt, @reason, 'active');
    `);
  return res.recordset[0];
}

export async function getHold(holdId) {
  const pool = await getPool();
  const res = await pool.request()
    .input('id', sql.UniqueIdentifier, holdId)
    .query('SELECT * FROM dbo.CreditHolds WHERE id=@id;');
  return res.recordset[0] || null;
}

export async function updateHoldStatus(holdId, status) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.UniqueIdentifier, holdId)
    .input('status', sql.VarChar(20), status)
    .query('UPDATE dbo.CreditHolds SET status=@status, updatedAt=SYSDATETIME() WHERE id=@id;');
}
