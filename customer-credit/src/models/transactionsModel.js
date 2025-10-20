// src/models/transactionsModel.js
import { getPool, sql } from '../config/db.js';

const isGuid = (s) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

export async function listByCredit(creditId) {
  if (!isGuid(creditId)) throw new Error(`creditId inválido (se esperaba UNIQUEIDENTIFIER): ${creditId}`);
  const pool = await getPool();
  const res = await pool.request()
    .input('creditId', sql.UniqueIdentifier, creditId)
    .query(`
      SELECT *
      FROM dbo.CreditTransactions
      WHERE creditId = @creditId
      ORDER BY createdAt DESC;
    `);
  return res.recordset;
}

export async function createTx(creditId, tx) {
  if (!isGuid(creditId)) throw new Error(`creditId inválido (se esperaba UNIQUEIDENTIFIER): ${creditId}`);

  // Normaliza/valida
  const type         = String(tx.type ?? '').toUpperCase();        // PAYMENT / CHARGE ...
  const direction    = String(tx.direction ?? '').toUpperCase();   // CREDIT / DEBIT
  const amount       = Number(tx.amount);
  const currency     = (tx.currency ?? 'CLP').toString().toUpperCase().slice(0, 3);
  const reference    = tx.reference ?? null;                       // RECOM: UNIQUE en DB
  const sourceSystem = tx.sourceSystem ?? null;
  const metaStr      = typeof tx.meta === 'string' ? tx.meta : (tx.meta ? JSON.stringify(tx.meta) : null);
  const occurredAt   = tx.occurredAt ? new Date(tx.occurredAt) : new Date();

  if (!isFinite(amount) || amount <= 0) throw new Error('amount inválido');
  if (!type || !direction) throw new Error('type y direction requeridos');

  const pool = await getPool();

  // Ejecuta tu SP que hace el insert + lógica de saldos
  // OJO: usa sólo los parámetros que tu SP realmente acepta.
  await pool.request()
    .input('creditId',     sql.UniqueIdentifier, creditId)
    .input('type',         sql.NVarChar(50),     type)
    .input('direction',    sql.NVarChar(10),     direction)
    .input('amount',       sql.Decimal(18, 2),   amount)
    // .input('currency',  sql.Char(3),          currency)     // ← descomenta si tu SP lo recibe
    .input('reference',    sql.NVarChar(150),    reference)
    .input('sourceSystem', sql.NVarChar(50),     sourceSystem)
    .input('meta',         sql.NVarChar(sql.MAX), metaStr)
    // .input('occurredAt', sql.DateTime2,       occurredAt)   // ← descomenta si tu SP lo recibe
    .query(`
      EXEC dbo.sp_ApplyTransaction
        @creditId=@creditId,
        @type=@type,
        @direction=@direction,
        @amount=@amount,
        @reference=@reference,
        @sourceSystem=@sourceSystem,
        @meta=@meta;
      -- ⚠️ No uses SCOPE_IDENTITY() con GUID
    `);

  // Recupera la fila insertada sin SCOPE_IDENTITY():
  // Usa reference (idempotencia de negocio) + amount como refuerzo
  const rs = await pool.request()
    .input('creditId',  sql.UniqueIdentifier, creditId)
    .input('reference', sql.NVarChar(150),    reference)
    .input('amount',    sql.Decimal(18, 2),   amount)
    .query(`
      SELECT TOP 1 *
      FROM dbo.CreditTransactions
      WHERE creditId = @creditId
        AND (@reference IS NULL OR reference = @reference)
        AND amount = @amount
      ORDER BY createdAt DESC;
    `);

  return rs.recordset?.[0] ?? null;
}
