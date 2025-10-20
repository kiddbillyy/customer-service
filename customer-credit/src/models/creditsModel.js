// src/models/creditsModel.js
import { getPool, sql } from '../config/db.js';

export async function upsertCredit({
  customerId = null,
  cardCode = null,
  creditLimit = undefined,     // undefined/null => no pisar (UPDATE) | 0 en INSERT
  paymentTermCode = null,
  riskLevel = undefined,       // undefined => no pisar | 0 en INSERT
  isBlocked = undefined,       // undefined => no pisar | 0 en INSERT
  notes = null
}) {
  const pool = await getPool();

  const q = `
MERGE dbo.CustomerCredits AS target
USING (
  SELECT @customerId AS customerId, @cardCode AS cardCode
) AS src
ON (
  (src.customerId IS NOT NULL AND target.customerId = src.customerId)
  OR
  (src.cardCode IS NOT NULL AND target.cardCode = src.cardCode)
)
WHEN MATCHED THEN
  UPDATE SET
    creditLimit     = COALESCE(@creditLimit, target.creditLimit),
    paymentTermCode = COALESCE(@paymentTermCode, target.paymentTermCode),
    riskLevel       = COALESCE(@riskLevel, target.riskLevel),
    isBlocked       = COALESCE(@isBlocked, target.isBlocked),
    notes           = COALESCE(@notes, target.notes),
    updatedAt       = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (id, customerId, cardCode, creditLimit, paymentTermCode, riskLevel, isBlocked, notes, usedAmount, onHoldAmount, createdAt, updatedAt)
  VALUES (NEWID(), @customerId, @cardCode,
          COALESCE(@creditLimit, 0),            -- 👈 nunca NULL
          @paymentTermCode,
          COALESCE(@riskLevel, 0),              -- 👈 default si no viene
          COALESCE(@isBlocked, 0),              -- 👈 default si no viene
          @notes,
          0, 0, SYSDATETIME(), SYSDATETIME())
OUTPUT inserted.*;
`;

  const req = pool.request()
    .input('customerId', sql.UniqueIdentifier, customerId)
    .input('cardCode', sql.NVarChar(50), cardCode)
    .input('creditLimit', sql.Decimal(18, 2), creditLimit ?? null)   // puede ser null; SQL lo maneja con COALESCE
    .input('paymentTermCode', sql.NVarChar(50), paymentTermCode)
    .input('riskLevel', sql.TinyInt, riskLevel ?? null)              // COALESCE en SQL
    .input('isBlocked', sql.Bit, isBlocked ?? null)                  // COALESCE en SQL
    .input('notes', sql.NVarChar(500), notes);

  const { recordset } = await req.query(q);
  return recordset[0];
}

export async function listCredits(filters = {}) {
  const pool = await getPool();
  const { customerId = null, cardCode = null, isBlocked = null } = filters;

  const res = await pool.request()
    .input('customerId', sql.UniqueIdentifier, customerId)
    .input('cardCode', sql.NVarChar(50), cardCode)
    .input('isBlocked', sql.Bit, isBlocked)
    .query(`
      SELECT * FROM dbo.CustomerCredits
      WHERE (@customerId IS NULL OR customerId = @customerId)
        AND (@cardCode   IS NULL OR cardCode   = @cardCode)
        AND (@isBlocked  IS NULL OR isBlocked  = @isBlocked)
      ORDER BY updatedAt DESC;
    `);
  return res.recordset;
}

export async function getById(id) {
  const pool = await getPool();
  const res = await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT * FROM dbo.CustomerCredits WHERE id = @id');
  return res.recordset[0] || null;
}

export async function patchCredit(id, patch) {
  const fields = [];
  const reqMap = [];

  // Evita pisar con NULL: si viene undefined no actualizamos; si viene null y la columna no permite null, ignoramos.
  if ('creditLimit' in patch && patch.creditLimit !== undefined) {
    fields.push('creditLimit = COALESCE(@creditLimit, creditLimit)');
    reqMap.push({ k: 'creditLimit', type: 'Decimal', args: [18, 2] });
  }
  if ('paymentTermCode' in patch) {
    fields.push('paymentTermCode = @paymentTermCode');
    reqMap.push({ k: 'paymentTermCode', type: 'NVarChar', args: [50] });
  }
  if ('riskLevel' in patch && patch.riskLevel !== undefined) {
    fields.push('riskLevel = COALESCE(@riskLevel, riskLevel)');
    reqMap.push({ k: 'riskLevel', type: 'TinyInt' });
  }
  if ('isBlocked' in patch && patch.isBlocked !== undefined) {
    fields.push('isBlocked = COALESCE(@isBlocked, isBlocked)');
    reqMap.push({ k: 'isBlocked', type: 'Bit' });
  }
  if ('notes' in patch) {
    fields.push('notes = @notes');
    reqMap.push({ k: 'notes', type: 'NVarChar', args: [500] });
  }
  if (fields.length === 0) return getById(id);

  const pool = await getPool();
  const req = pool.request().input('id', sql.UniqueIdentifier, id);
  for (const m of reqMap) {
    const v = patch[m.k];
    req.input(m.k, sql[m.type](...(m.args || [])), v ?? null);
  }
  await req.query(`
    UPDATE dbo.CustomerCredits
    SET ${fields.join(', ')}, updatedAt = SYSDATETIME()
    WHERE id = @id;
  `);
  return getById(id);
}

export async function recalculate(id) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .query('EXEC dbo.sp_RecalculateOnHoldAmount @creditId=@id;');
}
