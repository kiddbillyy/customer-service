import { getPool, sql } from '../config/db.js';
import * as creditModel from '../models/creditsModel.js';
import * as holdsModel from '../models/holdsModel.js';
import * as txModel from '../models/transactionsModel.js';

class RuleError extends Error { constructor(msg){ super(msg); this.name='RuleError'; } }

export async function placeHold(creditId, { amount, orderId, expiresAt, reason }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    // 🔒 Hints en el lugar correcto
    const req1 = new sql.Request(tx);
    const credit = (await req1
      .input('id', sql.UniqueIdentifier, creditId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.CustomerCredits WITH (UPDLOCK, ROWLOCK)
        WHERE id = @id;
      `)
    ).recordset[0];

    if (!credit) throw new RuleError('Crédito no existe');
    if (credit.isBlocked) throw new RuleError('Cliente bloqueado');

    const available = Number(credit.creditLimit) - Number(credit.usedAmount) - Number(credit.onHoldAmount);
    if (available < amount) throw new RuleError('Crédito insuficiente');

    // ✅ inserta el hold dentro de la misma transacción
    const hold = await holdsModel.createHoldTx(tx, creditId, { amount, orderId, expiresAt, reason });

    // 🔄 recálculo dentro de la misma transacción
    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, creditId)
      .query('EXEC dbo.sp_RecalculateOnHoldAmount @creditId=@id;');

    await tx.commit();
    return hold;
  } catch (e) {
    await tx.rollback();
    if (e instanceof RuleError) throw e;
    // devuelve el detalle real para depurar
    throw new Error(`Error al crear hold: ${e.message}`);
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
  const tx = await txModel.createTx(hold.creditId, {
    type: 'charge', direction: 'debit', amount: Number(hold.amount),
    reference: hold.orderId || holdId, sourceSystem: 'OMS'
  });
  await creditModel.recalculate(hold.creditId);
  return { holdId, transactionId: tx?.id };
}
