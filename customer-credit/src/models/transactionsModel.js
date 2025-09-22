import { getPool, sql } from '../config/db.js';

export async function listByCredit(creditId) {
  const pool = await getPool();
  const res = await pool.request()
    .input('creditId', sql.UniqueIdentifier, creditId)
    .query(`
      SELECT * FROM dbo.CreditTransactions
      WHERE creditId=@creditId
      ORDER BY createdAt DESC;
    `);
  return res.recordset;
}

export async function createTx(creditId, tx) {
  const pool = await getPool();
  const { type, direction, amount, currency='CLP', reference=null, sourceSystem=null, meta=null } = tx;

  const res = await pool.request()
    .input('creditId', sql.UniqueIdentifier, creditId)
    .input('type', sql.VarChar(20), type)
    .input('direction', sql.VarChar(6), direction)
    .input('amount', sql.Decimal(18,2), amount)
    .input('currency', sql.Char(3), currency)
    .input('reference', sql.NVarChar(100), reference)
    .input('sourceSystem', sql.NVarChar(30), sourceSystem)
    .input('meta', sql.NVarChar(sql.MAX), meta ? JSON.stringify(meta) : null)
    .query(`
      EXEC dbo.sp_ApplyTransaction
        @creditId=@creditId, @type=@type, @direction=@direction,
        @amount=@amount, @reference=@reference, @sourceSystem=@sourceSystem, @meta=@meta;
      SELECT * FROM dbo.CreditTransactions WHERE id = SCOPE_IDENTITY(); -- fallback si el proc devuelve output
    `);

  // En algunos servidores SCOPE_IDENTITY no aplica sobre GUID; retornamos último por tiempo
  const list = await pool.request()
    .input('creditId', sql.UniqueIdentifier, creditId)
    .query(`SELECT TOP 1 * FROM dbo.CreditTransactions WHERE creditId=@creditId ORDER BY createdAt DESC;`);
  return list.recordset[0];
}
