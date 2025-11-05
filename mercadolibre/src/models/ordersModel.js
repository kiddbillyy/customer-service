import { getPool, sql } from '../config/db.js';

export async function upsertMlOrderRow({ order, logisticType, isFull, shipmentId }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const req = new sql.Request(tx);
    req.input('OrderId',      sql.BigInt,  order.id);
    req.input('SellerId',     sql.BigInt,  order?.seller?.id ?? null);
    req.input('BuyerId',      sql.BigInt,  order?.buyer?.id ?? null);
    req.input('Status',       sql.NVarChar(50),  order.status || null);
    req.input('CurrencyId',   sql.NVarChar(10),  order.currency_id || null);
    req.input('TotalAmount',  sql.Decimal(18,2), order.total_amount ?? null);
    req.input('PaidAmount',   sql.Decimal(18,2), order.paid_amount ?? null);
    req.input('ShipmentId',   sql.BigInt,  shipmentId ?? order?.shipping?.id ?? null);
    req.input('LogisticType', sql.NVarChar(30),  logisticType ?? null);
    req.input('IsFull',       sql.Bit,     isFull ?? null);
    req.input('DateCreated',  sql.DateTime2, order?.date_created ? new Date(order.date_created) : null);
    req.input('LastUpdated',  sql.DateTime2, order?.last_updated ? new Date(order.last_updated) : (order?.date_created ? new Date(order.date_created) : null));
    req.input('RawOrderJson', sql.NVarChar(sql.MAX), JSON.stringify(order));

    const q = `
      UPDATE dbo.orders WITH (HOLDLOCK)
        SET SellerId=@SellerId, BuyerId=@BuyerId, Status=@Status,
            CurrencyId=@CurrencyId, TotalAmount=@TotalAmount, PaidAmount=@PaidAmount,
            ShipmentId=@ShipmentId, LogisticType=@LogisticType, IsFull=@IsFull,
            DateCreated=@DateCreated, LastUpdated=@LastUpdated, RawOrderJson=@RawOrderJson
      WHERE OrderId=@OrderId;

      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO dbo.orders
        (OrderId,SellerId,BuyerId,Status,CurrencyId,TotalAmount,PaidAmount,ShipmentId,LogisticType,IsFull,DateCreated,LastUpdated,RawOrderJson)
        VALUES
        (@OrderId,@SellerId,@BuyerId,@Status,@CurrencyId,@TotalAmount,@PaidAmount,@ShipmentId,@LogisticType,@IsFull,@DateCreated,@LastUpdated,@RawOrderJson);
      END
    `;
    await req.batch(q);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
