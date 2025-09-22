import { getPool, sql } from '../config/db.js';
import * as creditModel from '../models/creditsModel.js';
import * as holdsModel from '../models/holdsModel.js';
import * as txModel from '../models/transactionsModel.js';

class RuleError extends Error { constructor(msg){ super(msg); this.name='RuleError'; } }

export async function placeHold(creditId, { amount, orderId, expiresAt, reason }) {
  const pool = await getPool();
  const tx = new sql.Transaction(await pool);
  await tx.begin();

  try {
    const req1 = new sql.Request(tx);
    const credit = (await req1
      .input('id', sql.UniqueIdentifier, creditId)
      .query('SELECT * FROM dbo.CustomerCredits WHERE id=@id WITH (UPDLOCK, ROWLOCK)')).recordset[0];

    if (!credit) throw new RuleError('Crédito no existe');
    if (credit.isBlocked) throw new RuleError('Cliente bloqueado');
    const available = Number(credit.creditLimit) - Number(credit.usedAmount) - Number(credit.onHoldAmount);
    if (available < amount) throw new RuleError('Crédito insuficiente');

    const hold = await holdsModel.createHold(creditId, { amount, orderId, expiresAt, reason });

    const req2 = new sql.Request(tx);
    await req2
      .input('id', sql.UniqueIdentifier, creditId)
      .query('EXEC dbo.sp_RecalculateOnHoldAmount @creditId=@id;');

    await tx.commit();
    return hold;
  } catch (e) {
    await tx.rollback();
    if (e instanceof RuleError) throw e;
    throw new Error('Error al crear hold');
  }
}

export async function releaseHold(holdId) {
  const hold = await holdsModel.getHold(holdId);
  if (!hold) return;
  await holdsModel.updateHoldStatus(holdId, 'released');
  await creditModel.recalculate(hold.creditId);
}

export async function consumeHold(holdId) {
  const hold = await holdsModel.getHold(holdId);
  if (!hold) throw new Error('Hold no existe');
  if (hold.status !== 'active') throw new Error('Hold no activo');

  await holdsModel.updateHoldStatus(holdId, 'consumed');
  // cargo por la misma cantidad del hold
  const tx = await txModel.createTx(hold.creditId, {
    type: 'charge', direction: 'debit', amount: Number(hold.amount),
    reference: hold.orderId || holdId, sourceSystem: 'OMS'
  });
  await creditModel.recalculate(hold.creditId);
  return { holdId, transactionId: tx?.id };
}
