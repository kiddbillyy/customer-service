// models/Orders.Model.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

// ---------- Helpers ----------
const isPosInt = (n) => Number.isInteger(n) && n >= 0;
const toUtcDateOrNull = (v) => (v ? new Date(v) : null);
const uniq = (arr) => Array.from(new Set(arr));
const normMoney = (v, valuesInCents) => {
  if (v == null) return null;
  const num = Number(v);
  if (!Number.isFinite(num)) return null;
  return valuesInCents ? +(num / 100).toFixed(2) : +num.toFixed(2);
};
function ensureUniqueItemIndexes(items) {
  const idx = items.map((it, i) => (it?.itemIndex != null ? it.itemIndex : i));
  if (idx.length !== uniq(idx).length) throw new Error('DUPLICATE_ITEM_INDEX');
}
function validateItemRequired(it) {
  if (!it || !it.itemcode || !it.dscription || it.quantity == null || it.priceAfterVAT == null) {
    throw new Error('ITEM_REQUIRED_FIELDS');
  }
}

// ---------- Status helpers ----------
async function getOrCreateStatusId(tx, { orderStatusID = null, orderStatusCode = null }) {
  const r = new sql.Request(tx);
  if (orderStatusID != null) {
    const row = (await r.input('id', sql.Int, orderStatusID)
      .query('SELECT orderStatusID FROM dbo.order_status WHERE orderStatusID = @id')).recordset[0];
    if (!row) throw new Error('STATUS_NOT_FOUND');
    return orderStatusID;
  }
  if (!orderStatusCode) throw new Error('STATUS_NOT_FOUND');

  const code = String(orderStatusCode).trim();
  const rs = await r.input('code', sql.NVarChar(32), code)
    .query('SELECT orderStatusID FROM dbo.order_status WHERE statusCode = @code');
  if (rs.recordset[0]?.orderStatusID) return rs.recordset[0].orderStatusID;

  const ins = await new sql.Request(tx)
    .input('code', sql.NVarChar(32), code)
    .query(`
      INSERT INTO dbo.order_status(statusCode, [description], createdAtUtc)
      OUTPUT INSERTED.orderStatusID
      VALUES (@code, NULL, SYSUTCDATETIME());
    `);
  return ins.recordset[0].orderStatusID;
}

async function insertStatusHistory(tx, { orderID, newStatusID, previousStatusID = null }) {
  await new sql.Request(tx)
    .input('orderID', sql.Int, orderID)
    .input('orderStatusID', sql.Int, newStatusID)
    .input('previousStatusID', sql.Int, previousStatusID)
    .query(`
      INSERT INTO dbo.order_status_history(orderID, orderStatusID, previousStatusID, changeDate)
      VALUES (@orderID, @orderStatusID, @previousStatusID, SYSUTCDATETIME());
    `);
}

// ---------- Items ----------
async function insertItems(tx, { orderID, items = [], valuesInCents = true }) {
  if (!Array.isArray(items) || items.length === 0) return { inserted: 0 };
  ensureUniqueItemIndexes(items);

  let inserted = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const itemIndex = (it.itemIndex != null) ? it.itemIndex : i;
    validateItemRequired(it);

    const priceAfterVAT = normMoney(it.priceAfterVAT, valuesInCents);

    await new sql.Request(tx)
      .input('orderID', sql.Int, orderID)
      .input('itemIndex', sql.Int, itemIndex)
      .input('uniqueId', sql.NVarChar(64), it.uniqueId ?? null)
      .input('lineNum', sql.Int, it.lineNum ?? null)
      .input('itemcode', sql.NVarChar(64), it.itemcode)
      .input('dscription', sql.NVarChar(255), it.dscription)
      .input('quantity', sql.Int, it.quantity)
      .input('priceAfterVAT', sql.Decimal(18, 2), priceAfterVAT)
      .input('codebars', sql.NVarChar(50), it.codebars ?? null)
      .input('imageUrl', sql.NVarChar(512), it.imageUrl ?? null)
      .input('whscode', sql.NVarChar(50), it.whscode ?? null)
      .input('categoryLeafId', sql.Int, it.categoryLeafId ?? null)
      .input('categoryLeafName', sql.NVarChar(120), it.categoryLeafName ?? null)
      .input('categoryPathIds', sql.NVarChar(255), it.categoryPathIds ?? null)
      .input('categoryPathNames', sql.NVarChar(512), it.categoryPathNames ?? null)
      .query(`
        INSERT INTO dbo.Order_Items
          (orderID, itemIndex, uniqueId, lineNum, itemcode, dscription, quantity, priceAfterVAT, codebars, imageUrl, whscode,
           categoryLeafId, categoryLeafName, categoryPathIds, categoryPathNames)
        VALUES
          (@orderID, @itemIndex, @uniqueId, @lineNum, @itemcode, @dscription, @quantity, @priceAfterVAT, @codebars, @imageUrl, @whscode,
           @categoryLeafId, @categoryLeafName, @categoryPathIds, @categoryPathNames);
      `);

    inserted += 1;
  }
  return { inserted };
}

async function upsertItems(tx, { orderID, items = [], valuesInCents = true }) {
  if (!Array.isArray(items) || items.length === 0) return { upserted: 0 };

  let upserted = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const itemIndex = (it.itemIndex != null) ? it.itemIndex : i;
    if (!isPosInt(itemIndex)) throw new Error('ITEM_INDEX_REQUIRED');
    validateItemRequired(it);

    const priceAfterVAT = normMoney(it.priceAfterVAT, valuesInCents);

    await new sql.Request(tx)
      .input('orderID', sql.Int, orderID)
      .input('itemIndex', sql.Int, itemIndex)
      .input('uniqueId', sql.NVarChar(64), it.uniqueId ?? null)
      .input('lineNum', sql.Int, it.lineNum ?? null)
      .input('itemcode', sql.NVarChar(64), it.itemcode)
      .input('dscription', sql.NVarChar(255), it.dscription)
      .input('quantity', sql.Int, it.quantity)
      .input('priceAfterVAT', sql.Decimal(18, 2), priceAfterVAT)
      .input('codebars', sql.NVarChar(50), it.codebars ?? null)
      .input('imageUrl', sql.NVarChar(512), it.imageUrl ?? null)
      .input('whscode', sql.NVarChar(50), it.whscode ?? null)
      .input('categoryLeafId', sql.Int, it.categoryLeafId ?? null)
      .input('categoryLeafName', sql.NVarChar(120), it.categoryLeafName ?? null)
      .input('categoryPathIds', sql.NVarChar(255), it.categoryPathIds ?? null)
      .input('categoryPathNames', sql.NVarChar(512), it.categoryPathNames ?? null)
      .query(`
        MERGE dbo.Order_Items AS tgt
        USING (SELECT @orderID AS orderID, @itemIndex AS itemIndex) AS src
        ON (tgt.orderID = src.orderID AND tgt.itemIndex = src.itemIndex)
        WHEN MATCHED THEN
          UPDATE SET
            uniqueId        = @uniqueId,
            lineNum         = @lineNum,
            itemcode        = @itemcode,
            dscription      = @dscription,
            quantity        = @quantity,
            priceAfterVAT   = @priceAfterVAT,
            codebars        = @codebars,
            imageUrl        = @imageUrl,
            whscode         = @whscode,
            categoryLeafId   = @categoryLeafId,
            categoryLeafName = @categoryLeafName,
            categoryPathIds  = @categoryPathIds,
            categoryPathNames= @categoryPathNames
        WHEN NOT MATCHED THEN
          INSERT (orderID, itemIndex, uniqueId, lineNum, itemcode, dscription, quantity, priceAfterVAT, codebars, imageUrl, whscode,
                  categoryLeafId, categoryLeafName, categoryPathIds, categoryPathNames)
          VALUES (@orderID, @itemIndex, @uniqueId, @lineNum, @itemcode, @dscription, @quantity, @priceAfterVAT, @codebars, @imageUrl, @whscode,
                  @categoryLeafId, @categoryLeafName, @categoryPathIds, @categoryPathNames);
      `);

    upserted += 1;
  }
  return { upserted };
}

// ---------- CREATE (POST) ----------
async function createOrderWithItems(body) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  const valuesInCents = body.valuesInCents === false ? false : true;

  if (!body?.salesChannelReferenceId) throw new Error('salesChannelReferenceId es requerido');
  if (!body?.u_ref1)                   throw new Error('u_ref1 es requerido');

  try {
    await tx.begin();

    // existe?
    const exists = await new sql.Request(tx)
      .input('scr', sql.NVarChar(128), body.salesChannelReferenceId)
      .input('uref', sql.NVarChar(255), body.u_ref1)
      .query('SELECT 1 FROM dbo.Orders WHERE salesChannelReferenceId=@scr AND u_ref1=@uref');
    if (exists.recordset[0]) throw new Error('ORDER_EXISTS');

    const statusId = await getOrCreateStatusId(tx, {
      orderStatusID: body.orderStatusID ?? null,
      orderStatusCode: body.orderStatusCode ?? null
    });

    // Insert header
    const ins = await new sql.Request(tx)
      .input('scr', sql.NVarChar(128), body.salesChannelReferenceId)
      .input('uref', sql.NVarChar(255), body.u_ref1)
      .input('cardcode', sql.NVarChar(30),  body.cardcode ?? null)
      .input('cardname', sql.NVarChar(255), body.cardname ?? null)
      .input('phone1', sql.NVarChar(64),    body.phone1 ?? null)
      .input('email', sql.NVarChar(255),    body.e_mail ?? null)
      .input('itemsAmount', sql.Int,        body.itemsAmount ?? (Array.isArray(body.items) ? body.items.length : null))
      .input('doctotalsy', sql.Decimal(18,2), normMoney(body.doctotalsy, valuesInCents))
      .input('orderStatusID', sql.Int,      statusId)
      .input('deliveryDate', sql.DateTime2(3), toUtcDateOrNull(body.deliveryDate))
      .input('origin', sql.NVarChar(50),    body.origin ?? null)
      .input('hostname', sql.NVarChar(100), body.hostname ?? null)
      .input('DocEntryOrder', sql.Int,      body.DocEntryOrder ?? null)
      .input('DocEntryInvoice', sql.Int,    body.DocEntryInvoice ?? null)
      .input('folionum', sql.Int,           body.folionum ?? null)
      .input('integrationError', sql.NVarChar(sql.MAX), body.integrationError ?? null)
      .query(`
        INSERT INTO dbo.Orders
          (salesChannelReferenceId, u_ref1, cardcode, cardname, phone1, e_mail, itemsAmount, doctotalsy,
           orderStatusID, deliveryDate, lastQueryDate, createdate, updateDate, integrationError, origin, hostname,
           DocEntryOrder, DocEntryInvoice, folionum)
        OUTPUT INSERTED.orderID 
        VALUES
          (@scr, @uref, @cardcode, @cardname, @phone1, @email, @itemsAmount, @doctotalsy,
           @orderStatusID, @deliveryDate, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, @integrationError, @origin, @hostname,
           @DocEntryOrder, @DocEntryInvoice, @folionum);
      `);

    const orderID = ins.recordset[0].orderID;

    await insertStatusHistory(tx, { orderID, newStatusID: statusId, previousStatusID: null });

    const items = Array.isArray(body.items) ? body.items : [];
    const { inserted } = await insertItems(tx, {
      orderID,
      items,
      valuesInCents
    });

    await tx.commit();
    return { orderID, itemsInserted: inserted };
  } catch (err) {
    try { await tx.rollback(); } catch {}
    if (err && (err.number === 2627 || err.number === 2601)) {
      if ((err.message || '').includes('UQ_OrderItems_Order_ItemIndex')) err = new Error('DUPLICATE_ITEM_INDEX');
      if ((err.message || '').includes('UQ_Orders_Source_u_ref1')) err = new Error('ORDER_EXISTS');
    }
    throw err;
  }
}

// ---------- PATCH (UPDATE PARCIAL) ----------
async function patchOrder({ orderID, body }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  const valuesInCents = body?.valuesInCents === false ? false : true;

  try {
    await tx.begin();

    // obtener estado actual y existencia
    const cur = (await new sql.Request(tx)
      .input('id', sql.Int, orderID)
      .query('SELECT orderID, orderStatusID FROM dbo.Orders WHERE orderID=@id')).recordset[0];
    if (!cur) throw new Error('ORDER_NOT_FOUND');

    let newStatusID = cur.orderStatusID;
    let statusChanged = false;

    if (body.orderStatusID != null || body.orderStatusCode != null) {
      newStatusID = await getOrCreateStatusId(tx, {
        orderStatusID: body.orderStatusID ?? null,
        orderStatusCode: body.orderStatusCode ?? null
      });
      statusChanged = (newStatusID !== cur.orderStatusID);
    }

    // construir UPDATE parcial
    const set = [];
    const req = new sql.Request(tx).input('id', sql.Int, orderID);

    const setIf = (col, val, type) => {
      if (val !== undefined) { set.push(`${col} = @${col}`); req.input(col, type, val); }
    };

    setIf('cardcode', body.cardcode , sql.NVarChar(30));
    setIf('cardname', body.cardname , sql.NVarChar(255));
    setIf('phone1', body.phone1 , sql.NVarChar(64));
    setIf('e_mail', body.e_mail , sql.NVarChar(255));
    setIf('itemsAmount', body.itemsAmount , sql.Int);
    if (body.doctotalsy !== undefined) {
      req.input('doctotalsy', sql.Decimal(18,2), normMoney(body.doctotalsy, valuesInCents));
      set.push('doctotalsy = @doctotalsy');
    }
    if (body.deliveryDate !== undefined) {
      req.input('deliveryDate', sql.DateTime2(3), toUtcDateOrNull(body.deliveryDate));
      set.push('deliveryDate = @deliveryDate');
    }
    setIf('integrationError', body.integrationError , sql.NVarChar(sql.MAX));
    setIf('origin', body.origin , sql.NVarChar(50));
    setIf('hostname', body.hostname , sql.NVarChar(100));
    setIf('DocEntryOrder', body.DocEntryOrder , sql.Int);
    setIf('DocEntryInvoice', body.DocEntryInvoice , sql.Int);
    setIf('folionum', body.folionum , sql.Int);

    if (statusChanged) {
      req.input('orderStatusID', sql.Int, newStatusID);
      set.push('orderStatusID = @orderStatusID');
    }

    if (set.length > 0) {
      set.push('updateDate = SYSUTCDATETIME()');
      await req.query(`UPDATE dbo.Orders SET ${set.join(', ')} WHERE orderID = @id;`);
    }

    if (statusChanged) {
      await insertStatusHistory(tx, {
        orderID,
        newStatusID,
        previousStatusID: cur.orderStatusID
      });
    }

    // items: patch (upsert) o reemplazo completo
    let itemsUpserted = 0;
    if (Array.isArray(body.items) && body.items.length) {
      if (body.replaceItems === true) {
        await new sql.Request(tx).input('id', sql.Int, orderID)
          .query('DELETE FROM dbo.Order_Items WHERE orderID = @id;');
        const { inserted } = await insertItems(tx, {
          orderID,
          items: body.items,
          valuesInCents
        });
        itemsUpserted = inserted;
      } else {
        const { upserted } = await upsertItems(tx, {
          orderID,
          items: body.items,
          valuesInCents
        });
        itemsUpserted = upserted;
      }
    }

    await tx.commit();
    return { statusChanged, itemsUpserted };
  } catch (err) {
    try { await tx.rollback(); } catch {}
    if (err && (err.number === 2627 || err.number === 2601)) {
      if ((err.message || '').includes('UQ_OrderItems_Order_ItemIndex')) err = new Error('DUPLICATE_ITEM_INDEX');
    }
    throw err;
  }
}

module.exports = {
  createOrderWithItems,
  patchOrder,
};
