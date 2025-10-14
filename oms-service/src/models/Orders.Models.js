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

const toBit = (v) => {
  if (v == null) return null;         
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim().toLowerCase();
  return (s === '1' || s === 'true' || s === 'sí' || s === 'si' || s === 'y') ? 1 : 0;
};


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

    // Soporta ambas variantes de nombre
    const costingCode  = it.costingCode  ?? it.CostingCode  ?? null;
    const costingCode2 = it.costingCode2 ?? it.CostingCode2 ?? null;
    const taxCode      = it.taxCode      ?? it.TaxCode      ?? null;

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
      .input('seller', sql.NVarChar(150), it.seller ?? null)
      .input('CostingCode',  sql.NVarChar(50), costingCode)
      .input('CostingCode2', sql.NVarChar(50), costingCode2)
      .input('TaxCode',      sql.NVarChar(50), taxCode)
      .query(`
        INSERT INTO dbo.Order_Items
          (orderID, itemIndex, uniqueId, lineNum, itemcode, dscription, quantity, priceAfterVAT,
           codebars, imageUrl, whscode, categoryLeafId, categoryLeafName, categoryPathIds, categoryPathNames,
           seller, CostingCode, CostingCode2, TaxCode)
        VALUES
          (@orderID, @itemIndex, @uniqueId, @lineNum, @itemcode, @dscription, @quantity, @priceAfterVAT,
           @codebars, @imageUrl, @whscode, @categoryLeafId, @categoryLeafName, @categoryPathIds, @categoryPathNames,
           @seller, @CostingCode, @CostingCode2, @TaxCode);
      `);

    inserted += 1;
  }
  return { inserted };
}
// ---------- Fulfillment ----------
async function insertOrderFulfillment(tx, orderID, f = {}) {
  await new sql.Request(tx)
    .input('orderID',         sql.Int,           orderID)
    .input('firstName',       sql.NVarChar(150), f.firstName ?? null)
    .input('lastName',        sql.NVarChar(150), f.lastName ?? null)
    .input('email',           sql.NVarChar(254), f.email ?? null)
    .input('currencyCode',    sql.Char(3),       f.currencyCode ? String(f.currencyCode).toUpperCase() : null)
    .input('documentType',    sql.VarChar(20),   f.documentType ?? null)
    .input('document',        sql.NVarChar(40),  f.document ?? null)
    .input('phone',           sql.NVarChar(30),  f.phone ?? null)
    .input('isCorporate',     sql.Bit,           toBit(f.isCorporate))
    .input('giro',            sql.NVarChar(400), f.giro ?? null)
    .input('cardname',        sql.NVarChar(150), f.cardname ?? null) 
    .input('addressType',     sql.VarChar(30),   f.addressType ?? null) // 'delivery' | 'store' | 'pickup'
    .input('receiverName',    sql.NVarChar(150), f.receiverName ?? null)
    .input('postalCode',      sql.NVarChar(20),  f.postalCode ?? null)
    .input('city',            sql.NVarChar(100), f.city ?? null)
    .input('country',         sql.Char(10),       f.country ? String(f.country).toUpperCase() : null)
    .input('state',           sql.NVarChar(100), f.state ?? null)
    .input('street',          sql.NVarChar(200), f.street ?? null)
    .input('number',          sql.NVarChar(100),  f.number ?? null)
    .input('neighborhood',    sql.NVarChar(100), f.neighborhood ?? null)
    .input('referenceAddress',sql.NVarChar(400), f.referenceAddress ?? null)
    .query(`
      INSERT INTO dbo.order_fulfillment (
        orderID, firstName, lastName, email, currencyCode, documentType, [document], phone, isCorporate,
        giro, cardname, addressType, receiverName, postalCode, city, country, [state], street, [number], neighborhood, referenceAddress
      ) VALUES (
        @orderID, @firstName, @lastName, @email, @currencyCode, @documentType, @document, @phone, @isCorporate,
        @giro, @cardname, @addressType, @receiverName, @postalCode, @city, @country, @state, @street, @number, @neighborhood, @referenceAddress
      );
    `);
}

async function updateOrderFulfillmentPartial(tx, orderID, f = {}) {
  // Si no vino nada para actualizar, no hacemos nada
  if (!f || typeof f !== 'object') return { updated: 0 };

  const req = new sql.Request(tx).input('orderID', sql.Int, orderID);
  const set = [];

  const setIf = (col, val, type, transform = (x) => x) => {
    if (val !== undefined) {
      set.push(`${col} = @${col}`);
      req.input(col, type, transform(val));
    }
  };
  setIf('firstName',        f.firstName,        sql.NVarChar(150));
  setIf('lastName',         f.lastName,         sql.NVarChar(150));
  setIf('email',            f.email,            sql.NVarChar(254));
  setIf('currencyCode',     f.currencyCode,     sql.Char(3),   (v) => v ? String(v).toUpperCase() : null);
  setIf('documentType',     f.documentType,     sql.VarChar(20));
  setIf('document',         f.document,         sql.NVarChar(40));
  setIf('phone',            f.phone,            sql.NVarChar(30));
  if (f.isCorporate !== undefined) {
    set.push('isCorporate = @isCorporate');
    req.input('isCorporate', sql.Bit, toBit(f.isCorporate));
  }
  setIf('giro',             f.giro,            sql.NVarChar(400));
  setIf('cardname',         f.cardname,        sql.NVarChar(150));
  setIf('addressType',      f.addressType,      sql.VarChar(30));
  setIf('receiverName',     f.receiverName,     sql.NVarChar(150));
  setIf('postalCode',       f.postalCode,       sql.NVarChar(20));
  setIf('city',             f.city,             sql.NVarChar(100));
  setIf('country',          f.country,          sql.Char(10),   (v) => v ? String(v).toUpperCase() : null);
  setIf('state',            f.state,            sql.NVarChar(100));
  setIf('street',           f.street,           sql.NVarChar(200));
  setIf('[number]',         f.number,           sql.NVarChar(20));         
  setIf('neighborhood',     f.neighborhood,     sql.NVarChar(100));
  setIf('referenceAddress', f.referenceAddress, sql.NVarChar(400));

  if (set.length === 0) return { updated: 0 };

  const q = `UPDATE dbo.order_fulfillment SET ${set.join(', ')} WHERE orderID = @orderID;`;
  const r = await req.query(q);
  return { updated: r.rowsAffected?.[0] || 0 };
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

    // soporta camelCase / SAP case
    const costingCode  = it.costingCode  ?? it.CostingCode  ?? null;
    const costingCode2 = it.costingCode2 ?? it.CostingCode2 ?? null;
    const taxCode      = it.taxCode      ?? it.TaxCode      ?? null;

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
      .input('seller', sql.NVarChar(150), it.seller ?? null)
      // 🔹 nuevos
      .input('CostingCode',  sql.NVarChar(50), costingCode)
      .input('CostingCode2', sql.NVarChar(50), costingCode2)
      .input('TaxCode',      sql.NVarChar(50), taxCode)
      .query(`
        MERGE dbo.Order_Items AS tgt
        USING (SELECT @orderID AS orderID, @itemIndex AS itemIndex) AS src
        ON (tgt.orderID = src.orderID AND tgt.itemIndex = src.itemIndex)
        WHEN MATCHED THEN
          UPDATE SET
            uniqueId         = @uniqueId,
            lineNum          = @lineNum,
            itemcode         = @itemcode,
            dscription       = @dscription,
            quantity         = @quantity,
            priceAfterVAT    = @priceAfterVAT,
            codebars         = @codebars,
            imageUrl         = @imageUrl,
            whscode          = @whscode,
            categoryLeafId   = @categoryLeafId,
            categoryLeafName = @categoryLeafName,
            categoryPathIds  = @categoryPathIds,
            categoryPathNames= @categoryPathNames,
            seller           = @seller,
            CostingCode      = @CostingCode,      
            CostingCode2     = @CostingCode2,     
            TaxCode          = @TaxCode           
        WHEN NOT MATCHED THEN
          INSERT (
            orderID, itemIndex, uniqueId, lineNum, itemcode, dscription, quantity, priceAfterVAT,
            codebars, imageUrl, whscode, categoryLeafId, categoryLeafName, categoryPathIds, categoryPathNames,
            seller, CostingCode, CostingCode2, TaxCode   
          )
          VALUES (
            @orderID, @itemIndex, @uniqueId, @lineNum, @itemcode, @dscription, @quantity, @priceAfterVAT,
            @codebars, @imageUrl, @whscode, @categoryLeafId, @categoryLeafName, @categoryPathIds, @categoryPathNames,
            @seller, @CostingCode, @CostingCode2, @TaxCode   
          );
      `);

    upserted += 1;
  }
  return { upserted };
}


async function createOrderWithItems(body) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  const valuesInCents = body.valuesInCents === false ? false : true;

  if (!body?.salesChannelReferenceId) throw new Error('salesChannelReferenceId es requerido');
  if (!body?.u_ref1)                   throw new Error('u_ref1 es requerido');

  try {
    await tx.begin();

    const exists = await new sql.Request(tx)
      .input('scr',  sql.NVarChar(128), body.salesChannelReferenceId)
      .input('uref', sql.NVarChar(255), body.u_ref1)
      .query('SELECT 1 FROM dbo.Orders WHERE salesChannelReferenceId=@scr AND u_ref1=@uref');
    if (exists.recordset[0]) throw new Error('ORDER_EXISTS');

    const statusId = await getOrCreateStatusId(tx, {
      orderStatusID:  body.orderStatusID  ?? null,
      orderStatusCode: body.orderStatusCode ?? null
    });

    // Insert header (nuevas columnas shippingEstimate / deliveryCompany)
    const ins = await new sql.Request(tx)
      .input('scr',             sql.NVarChar(128), body.salesChannelReferenceId)
      .input('uref',            sql.NVarChar(255), body.u_ref1)
      .input('itemsAmount',     sql.Int,           body.itemsAmount ?? (Array.isArray(body.items) ? body.items.length : null))
      .input('doctotalsy',      sql.Decimal(18,2), normMoney(body.doctotalsy, valuesInCents))
      .input('orderStatusID',   sql.Int,           statusId)
      .input('deliveryDate',    sql.DateTime2(3),  toUtcDateOrNull(body.deliveryDate))
      .input('origin',          sql.NVarChar(50),  body.origin ?? null)
      .input('hostname',        sql.NVarChar(100), body.hostname ?? null)
      .input('InvoiceDocNum',   sql.Int,           body.InvoiceDocNum ?? null)
      .input('DocEntryInvoice', sql.Int,           body.DocEntryInvoice ?? null)
      .input('folionum',        sql.Int,           body.folionum ?? null)
      .input('integrationError',sql.NVarChar(sql.MAX), body.integrationError ?? null)
      .input('shippingEstimate',sql.NVarChar(50),  body.shippingEstimate ?? null)
      .input('deliveryCompany', sql.NVarChar(100), body.deliveryCompany ?? null)
      .input('seller',        sql.NVarChar(150), body.seller ?? null)
      .input('isReservationInvoice', sql.Bit, toBit(body.isReservationInvoice))

      .query(`
        INSERT INTO dbo.Orders
          (salesChannelReferenceId, u_ref1, itemsAmount, doctotalsy,
           orderStatusID, deliveryDate, lastQueryDate, createdate, updateDate,
           integrationError, origin, hostname, InvoiceDocNum, DocEntryInvoice, folionum,
           shippingEstimate, deliveryCompany, seller, isReservationInvoice)
        OUTPUT INSERTED.orderID
        VALUES
          (@scr, @uref, @itemsAmount, @doctotalsy,
           @orderStatusID, @deliveryDate, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL,
           @integrationError, @origin, @hostname, @InvoiceDocNum, @DocEntryInvoice, @folionum,
           @shippingEstimate, @deliveryCompany, @seller, @isReservationInvoice);
      `);

    const orderID = ins.recordset[0].orderID;

    // ✅ Insert fulfillment usando el MISMO orderID (si viene en el payload)
    if (body.fulfillment) {
      // no exigimos 'mode'; addressType indica el tipo (delivery/store/pickup)
      await insertOrderFulfillment(tx, orderID, body.fulfillment);
    }

    await insertStatusHistory(tx, { orderID, newStatusID: statusId, previousStatusID: null });

    const items = Array.isArray(body.items) ? body.items : [];
    const itemsWithVendedor = items.map(it => ({ ...it, seller: it?.seller ?? (body.seller ?? null) }));
    const { inserted } = await insertItems(tx, { orderID, items: itemsWithVendedor, valuesInCents });

    await tx.commit();
    return { orderID, itemsInserted: inserted };
  } catch (err) {
    try { await tx.rollback(); } catch {}
    if (err && (err.number === 2627 || err.number === 2601)) {
      if ((err.message || '').includes('UQ_OrderItems_Order_ItemIndex')) err = new Error('DUPLICATE_ITEM_INDEX');
      if ((err.message || '').includes('UQ_Orders_Source_u_ref1'))       err = new Error('ORDER_EXISTS');
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

    // existencia y estado actual
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

    // UPDATE parcial del header
    const set = [];
    const req = new sql.Request(tx).input('id', sql.Int, orderID);
    const setIf = (col, val, type) => {
      if (val !== undefined) { set.push(`${col} = @${col}`); req.input(col, type, val); }
    };
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
    setIf('InvoiceDocNum', body.InvoiceDocNum , sql.Int);
    setIf('DocEntryInvoice', body.DocEntryInvoice , sql.Int);
    setIf('folionum', body.folionum , sql.Int);
    setIf('shippingEstimate', body.shippingEstimate , sql.NVarChar(50));
    setIf('deliveryCompany',  body.deliveryCompany  , sql.NVarChar(100));
    setIf('seller',         body.seller,        sql.NVarChar(150)); 

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

    // ------ Fulfillment: upsert parcial ------
    let fulfillmentChanged = false;
    if (body.fulfillment && typeof body.fulfillment === 'object') {
      const exists = await new sql.Request(tx)
        .input('id', sql.Int, orderID)
        .query('SELECT 1 FROM dbo.order_fulfillment WHERE orderID = @id');

      if (exists.recordset[0]) {
        const { updated } = await updateOrderFulfillmentPartial(tx, orderID, body.fulfillment);
        fulfillmentChanged = updated > 0;
      } else {
        await insertOrderFulfillment(tx, orderID, body.fulfillment);
        fulfillmentChanged = true;
      }
    }

    // ------ Items ------
    let itemsUpserted = 0;
    if (Array.isArray(body.items) && body.items.length) {
      // hereda seller desde body.seller si el ítem no lo trae
      const itemsWithVendedor = body.items.map(it => ({ ...it, seller: it?.seller ?? (body.seller ?? null) }));

      if (body.replaceItems === true) {
        await new sql.Request(tx).input('id', sql.Int, orderID)
          .query('DELETE FROM dbo.Order_Items WHERE orderID = @id;');
        const { inserted } = await insertItems(tx, {
          orderID,
          items: itemsWithVendedor,
          valuesInCents
        });
        itemsUpserted = inserted;
      } else {
        const { upserted } = await upsertItems(tx, {
          orderID,
          items: itemsWithVendedor,   
          valuesInCents
        });
        itemsUpserted = upserted;
      }
    }

    await tx.commit();
    return { statusChanged, itemsUpserted, fulfillmentChanged };
  } catch (err) {
    try { await tx.rollback(); } catch {}
    if (err && (err.number === 2627 || err.number === 2601)) {
      if ((err.message || '').includes('UQ_OrderItems_Order_ItemIndex')) err = new Error('DUPLICATE_ITEM_INDEX');
    }
    throw err;
  }
}

const moneyOut = (v, valuesInCents) => {
  if (v == null) return null;
  const num = Number(v);
  if (!Number.isFinite(num)) return null;
  return valuesInCents ? Math.round(num * 100) : +num;
};

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bindIdList(req, ids, prefix = 'id') {
  const names = [];
  ids.forEach((id, i) => {
    const name = `${prefix}${i}`;
    req.input(name, sql.Int, id);
    names.push(`@${name}`);
  });
  return names.length ? names.join(',') : null;
}

async function getOrder(query = {}, options = {}) {
  const {
    includeItems = true,
    includeFulfillment = true,
    includeHistory = true,
    valuesInCents = true,
  } = options;

  await IdServicePoolConnect;

  // -------------------------
  // MODO DETALLE (id o par)
  // -------------------------
  const hasId   = isPosInt(query.orderID);
  const hasPair = !!(query.salesChannelReferenceId && query.u_ref1);

  if (hasId || hasPair) {
    let where = [];
    const req = new sql.Request(IdServicePool);

    if (hasId) {
      where.push('o.orderID = @id');
      req.input('id', sql.Int, query.orderID);
    } else {
      where.push('o.salesChannelReferenceId = @scr AND o.u_ref1 = @uref');
      req.input('scr', sql.NVarChar(128), String(query.salesChannelReferenceId));
      req.input('uref', sql.NVarChar(255), String(query.u_ref1));
    }

    // Header + status
    const headerRs = await req.query(`
      SELECT
        o.orderID,
        o.salesChannelReferenceId,
        o.u_ref1,
        o.itemsAmount,
        o.doctotalsy,
        o.orderStatusID,
        s.statusCode,
        s.[description] AS statusDescription,
        o.deliveryDate,
        o.lastQueryDate,
        o.createdate,
        o.updateDate,
        o.integrationError,
        o.origin,
        o.hostname,
        o.InvoiceDocNum,
        o.DocEntryInvoice,
        o.folionum,
        o.shippingEstimate,
        o.deliveryCompany,
        o.customerIntegrated,
        o.customerIntegratedAt,
        o.customerCardCode,
        o.seller,
        o.isReservationInvoice
      FROM dbo.Orders AS o
      INNER JOIN dbo.order_status AS s ON s.orderStatusID = o.orderStatusID
      WHERE ${where.join(' AND ')}
    `);

    const head = headerRs.recordset[0];
    if (!head) throw new Error('ORDER_NOT_FOUND');

    const orderID = head.orderID;
    const out = {
      mode: 'detail',
      orderID,
      salesChannelReferenceId: head.salesChannelReferenceId,
      u_ref1: head.u_ref1,
      itemsAmount: head.itemsAmount,
      doctotalsy: moneyOut(head.doctotalsy, valuesInCents),
      status: {
        orderStatusID: head.orderStatusID,
        statusCode: head.statusCode,
        description: head.statusDescription ?? null,
      },
      deliveryDate: head.deliveryDate,
      lastQueryDate: head.lastQueryDate,
      createdate: head.createdate,
      updateDate: head.updateDate,
      integrationError: head.integrationError ?? null,
      origin: head.origin ?? null,
      hostname: head.hostname ?? null,
      InvoiceDocNum: head.InvoiceDocNum ?? null,
      DocEntryInvoice: head.DocEntryInvoice ?? null,
      folionum: head.folionum ?? null,
      shippingEstimate: head.shippingEstimate ?? null,
      deliveryCompany: head.deliveryCompany ?? null,
      customerIntegrated: head.customerIntegrated ?? null,
      customerIntegratedAt: head.customerIntegratedAt ?? null,
      customerCardCode: head.customerCardCode ?? null,
      seller: head.seller ?? null,
      isReservationInvoice: head.isReservationInvoice ?? 0,
    };

    // Fulfillment (sin seller porque solo va en Orders/Order_Items)
    if (includeFulfillment) {
      const frs = await new sql.Request(IdServicePool)
        .input('id', sql.Int, orderID)
        .query(`
          SELECT
            orderID, firstName, lastName, email, currencyCode, documentType, [document], phone,
            isCorporate, giro, addressType, receiverName, postalCode, city, country, [state],
            street, [number], neighborhood, referenceAddress
          FROM dbo.order_fulfillment
          WHERE orderID = @id
        `);
      out.fulfillment = frs.recordset[0] || null;
    }

    // Items (detalle) — agrega seller
    if (includeItems) {
      const irs = await new sql.Request(IdServicePool)
        .input('id', sql.Int, orderID)
        .query(`
          SELECT
            id, itemIndex, uniqueId, lineNum, itemcode, dscription, quantity,
            priceAfterVAT, codebars, imageUrl, whscode,
            categoryLeafId, categoryLeafName, categoryPathIds, categoryPathNames,
            seller, CostingCode, CostingCode2, TaxCode
          FROM dbo.Order_Items
          WHERE orderID = @id
          ORDER BY itemIndex ASC, id ASC

        `);
      out.items = irs.recordset.map(r => ({
        id: r.id,
        itemIndex: r.itemIndex,
        uniqueId: r.uniqueId ?? null,
        lineNum: r.lineNum ?? null,
        itemcode: r.itemcode,
        dscription: r.dscription,
        quantity: r.quantity,
        priceAfterVAT: moneyOut(r.priceAfterVAT, valuesInCents),
        codebars: r.codebars ?? null,
        imageUrl: r.imageUrl ?? null,
        whscode: r.whscode ?? null,
        categoryLeafId: r.categoryLeafId ?? null,
        categoryLeafName: r.categoryLeafName ?? null,
        categoryPathIds: r.categoryPathIds ?? null,
        categoryPathNames: r.categoryPathNames ?? null,
        seller: r.seller ?? null, 
        costingCode:  r.CostingCode  ?? null,
        costingCode2: r.CostingCode2 ?? null,
        taxCode:      r.TaxCode      ?? null,
      }));
    }

    // Historial de estatus
    if (includeHistory) {
      const hrs = await new sql.Request(IdServicePool)
        .input('id', sql.Int, orderID)
        .query(`
          SELECT
            h.historyID,
            h.orderStatusID,
            cs.statusCode AS statusCode,
            cs.[description] AS statusDescription,
            h.previousStatusID,
            ps.statusCode AS previousStatusCode,
            ps.[description] AS previousStatusDescription,
            h.changeDate
          FROM dbo.order_status_history AS h
          LEFT JOIN dbo.order_status AS cs ON cs.orderStatusID = h.orderStatusID
          LEFT JOIN dbo.order_status AS ps ON ps.orderStatusID = h.previousStatusID
          WHERE h.orderID = @id
          ORDER BY h.changeDate DESC, h.historyID DESC
        `);
      out.statusHistory = hrs.recordset.map(r => ({
        historyID: r.historyID,
        orderStatusID: r.orderStatusID,
        statusCode: r.statusCode,
        statusDescription: r.statusDescription ?? null,
        previousStatusID: r.previousStatusID ?? null,
        previousStatusCode: r.previousStatusCode ?? null,
        previousStatusDescription: r.previousStatusDescription ?? null,
        changeDate: r.changeDate,
      }));
    }

    return out;
  }

  // -------------------------
  // MODO LISTA (paginado)
  // -------------------------
  const {
    salesChannelReferenceId,
    u_ref1,
    statusCode,
    statusId,
    createdFrom,
    createdTo,
    search,
    page: qPage,
    pageSize: qPageSize,
  } = query;

  const wantItems        = includeItems === true;
  const wantFulfillment  = includeFulfillment === true;
  const wantHistory      = includeHistory === true;
  const valuesInCentsOut = valuesInCents !== false; // default true

  let page = Math.max(1, toIntOrNull(qPage) ?? 1);
  let pageSize = Math.min(200, Math.max(1, toIntOrNull(qPageSize) ?? 50));
  const offset = (page - 1) * pageSize;

  const baseReq = new sql.Request(IdServicePool);
  const where = ['1=1'];

  if (salesChannelReferenceId) {
    where.push('o.salesChannelReferenceId = @scr');
    baseReq.input('scr', sql.NVarChar(128), String(salesChannelReferenceId));
  }
  if (u_ref1) {
    where.push('o.u_ref1 = @uref');
    baseReq.input('uref', sql.NVarChar(255), String(u_ref1));
  }
  if (statusId != null) {
    where.push('o.orderStatusID = @sid');
    baseReq.input('sid', sql.Int, Number(statusId));
  }
  if (statusCode) {
    where.push('s.statusCode = @scode');
    baseReq.input('scode', sql.NVarChar(32), String(statusCode));
  }
  if (createdFrom) {
    where.push('o.createdate >= @cfrom');
    baseReq.input('cfrom', sql.DateTime2(3), new Date(createdFrom));
  }
  if (createdTo) {
    where.push('o.createdate < @cto');
    baseReq.input('cto', sql.DateTime2(3), new Date(createdTo));
  }
  if (search) {
    where.push('o.u_ref1 LIKE @search');
    baseReq.input('search', sql.NVarChar(255), `%${String(search)}%`);
  }

  // total
  const totalRs = await baseReq.query(`
    SELECT COUNT(1) AS total
    FROM dbo.Orders o
    INNER JOIN dbo.order_status s ON s.orderStatusID = o.orderStatusID
    WHERE ${where.join(' AND ')}
  `);
  const total = totalRs.recordset[0]?.total ?? 0;

  // página
  const pageReq = new sql.Request(IdServicePool);
  for (const p of baseReq.parameters ? Object.values(baseReq.parameters) : []) {
    pageReq.input(p.name, p.type, p.value);
  }
  pageReq.input('limit', sql.Int, pageSize);
  pageReq.input('offset', sql.Int, offset);

  const rs = await pageReq.query(`
    SELECT
      o.orderID,
      o.salesChannelReferenceId,
      o.u_ref1,
      o.itemsAmount,
      o.doctotalsy,
      o.orderStatusID,
      s.statusCode,
      s.[description] AS statusDescription,
      o.deliveryDate,
      o.createdate,
      o.updateDate,
      o.integrationError,
      o.customerIntegrated,
      o.customerIntegratedAt,
      o.customerCardCode,
      o.seller,
      o.isReservationInvoice           
    FROM dbo.Orders o
    INNER JOIN dbo.order_status s ON s.orderStatusID = o.orderStatusID
    WHERE ${where.join(' AND ')}
    ORDER BY o.createdate DESC, o.orderID DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);

  const rows = rs.recordset.map(r => ({
    orderID: r.orderID,
    salesChannelReferenceId: r.salesChannelReferenceId,
    integrationError: r.integrationError,
    customerIntegrated: r.customerIntegrated,
    customerIntegratedAt: r.customerIntegratedAt,
    customerCardCode: r.customerCardCode,
    u_ref1: r.u_ref1,
    itemsAmount: r.itemsAmount,
    doctotalsy: moneyOut(r.doctotalsy, valuesInCentsOut),
    status: {
      orderStatusID: r.orderStatusID,
      statusCode: r.statusCode,
      description: r.statusDescription,
    },
    deliveryDate: r.deliveryDate,
    createdate: r.createdate,
    updateDate: r.updateDate,
    seller: r.seller ?? null,
    isReservationInvoice: r.isReservationInvoice ?? 0,  
  }));

  // Batch expand
  const pageOrderIds = rows.map(r => r.orderID);
  if (pageOrderIds.length && (wantItems || wantFulfillment || wantHistory)) {
    // Fulfillment
    if (wantFulfillment) {
      const fReq = new sql.Request(IdServicePool);
      const inList = bindIdList(fReq, pageOrderIds, 'fid');
      if (inList) {
        const frs = await fReq.query(`
          SELECT
            orderID, firstName, lastName, email, currencyCode, documentType, [document], phone,
            isCorporate, giro, addressType, receiverName, postalCode, city, country, [state],
            street, [number], neighborhood, referenceAddress
          FROM dbo.order_fulfillment
          WHERE orderID IN (${inList})
        `);
        const fMap = new Map(frs.recordset.map(r => [r.orderID, r]));
        rows.forEach(r => { r.fulfillment = fMap.get(r.orderID) || null; });
      }
    }

    // Items (lista) — agrega seller
    if (wantItems) {
      const iReq = new sql.Request(IdServicePool);
      const inList = bindIdList(iReq, pageOrderIds, 'iid');
      if (inList) {
        const irs2 = await iReq.query(`
        SELECT
          orderID, id, itemIndex, uniqueId, lineNum, itemcode, dscription, quantity,
          priceAfterVAT, codebars, imageUrl, whscode,
          categoryLeafId, categoryLeafName, categoryPathIds, categoryPathNames,
          seller,
          CostingCode, CostingCode2, TaxCode
        FROM dbo.Order_Items
        WHERE orderID IN (${inList})
        ORDER BY orderID ASC, itemIndex ASC, id ASC

        `);
        const itemsByOrder = new Map();
        irs2.recordset.forEach(r => {
          if (!itemsByOrder.has(r.orderID)) itemsByOrder.set(r.orderID, []);
          itemsByOrder.get(r.orderID).push({
            id: r.id,
            itemIndex: r.itemIndex,
            uniqueId: r.uniqueId ?? null,
            lineNum: r.lineNum ?? null,
            itemcode: r.itemcode,
            dscription: r.dscription,
            quantity: r.quantity,
            priceAfterVAT: moneyOut(r.priceAfterVAT, valuesInCentsOut),
            codebars: r.codebars ?? null,
            imageUrl: r.imageUrl ?? null,
            whscode: r.whscode ?? null,
            categoryLeafId: r.categoryLeafId ?? null,
            categoryLeafName: r.categoryLeafName ?? null,
            categoryPathIds: r.categoryPathIds ?? null,
            categoryPathNames: r.categoryPathNames ?? null,
            seller: r.seller ?? null,
            costingCode:  r.CostingCode  ?? null,
            costingCode2: r.CostingCode2 ?? null,
            taxCode:      r.TaxCode      ?? null,
          });
        });
        rows.forEach(r => { r.items = itemsByOrder.get(r.orderID) || []; });
      }
    }

    // Historial
    if (wantHistory) {
      const hReq = new sql.Request(IdServicePool);
      const inList = bindIdList(hReq, pageOrderIds, 'hid');
      if (inList) {
        const hrs2 = await hReq.query(`
          SELECT
            h.orderID,
            h.historyID,
            h.orderStatusID,
            cs.statusCode            AS statusCode,
            cs.[description]         AS statusDescription,
            h.previousStatusID,
            ps.statusCode            AS previousStatusCode,
            ps.[description]         AS previousStatusDescription,
            h.changeDate
          FROM dbo.order_status_history AS h
          LEFT JOIN dbo.order_status AS cs ON cs.orderStatusID = h.orderStatusID
          LEFT JOIN dbo.order_status AS ps ON ps.orderStatusID = h.previousStatusID
          WHERE h.orderID IN (${inList})
          ORDER BY h.orderID ASC, h.changeDate DESC, h.historyID DESC
        `);
        const histByOrder = new Map();
        hrs2.recordset.forEach(r => {
          if (!histByOrder.has(r.orderID)) histByOrder.set(r.orderID, []);
          histByOrder.get(r.orderID).push({
            historyID: r.historyID,
            orderStatusID: r.orderStatusID,
            statusCode: r.statusCode,
            statusDescription: r.statusDescription ?? null,
            previousStatusID: r.previousStatusID ?? null,
            previousStatusCode: r.previousStatusCode ?? null,
            previousStatusDescription: r.previousStatusDescription ?? null,
            changeDate: r.changeDate,
          });
        });
        rows.forEach(r => { r.statusHistory = histByOrder.get(r.orderID) || []; });
      }
    }
  }

  return {
    mode: 'list',
    page,
    pageSize,
    total,
    rows,
  };
}


async function getOrdersPendingCustomerIntegration(query = {}) {
  const {
    createdFrom,      // opcional: ISO date/string
    createdTo,        // opcional: ISO date/string (exclusivo)
    page = 1,
    pageSize = 100,   // máx 500 recomendado
  } = query;

  await IdServicePoolConnect;

  const _page = Math.max(1, Number(page) || 1);
  const _pageSize = Math.min(500, Math.max(1, Number(pageSize) || 100));
  const offset = (_page - 1) * _pageSize;

  // WHERE base: customerIntegrated = 0 (o NULL)
  const where = ['ISNULL(o.customerIntegrated, 0) = 0'];
  const reqCount = new sql.Request(IdServicePool);
  if (createdFrom) {
    where.push('o.createdate >= @cfrom');
    reqCount.input('cfrom', sql.DateTime2(3), new Date(createdFrom));
  }
  if (createdTo) {
    where.push('o.createdate < @cto');
    reqCount.input('cto', sql.DateTime2(3), new Date(createdTo));
  }

  // total
  const countSql = `
    SELECT COUNT(1) AS total
    FROM dbo.Orders o
    WHERE ${where.join(' AND ')}
  `;
  const total = (await reqCount.query(countSql)).recordset[0]?.total ?? 0;

  // página (LEFT JOIN 1:1 con fulfillment)
  const req = new sql.Request(IdServicePool);
  for (const p of reqCount.parameters ? Object.values(reqCount.parameters) : []) {
    req.input(p.name, p.type, p.value);
  }
  req.input('limit', sql.Int, _pageSize);
  req.input('offset', sql.Int, offset);

  const pageSql = `
    SELECT
      -- Header
      o.orderID,
      o.salesChannelReferenceId,
      o.u_ref1,
      o.integrationError,
      o.origin,
      o.hostname,
      o.createdate,
      o.updateDate,
      o.orderStatusID,
      o.customerIntegrated,
      o.customerIntegratedAt,
      o.customerCardCode,

      -- Fulfillment para reintento de customer
      f.firstName,
      f.lastName,
      f.email,
      f.currencyCode,
      f.documentType,
      f.[document],
      f.phone,
      f.isCorporate,
      f.giro,
      f.cardname,
      f.addressType,
      f.receiverName,
      f.postalCode,
      f.city,
      f.country,
      f.[state],
      f.street,
      f.[number],
      f.neighborhood,
      f.referenceAddress
    FROM dbo.Orders o
    LEFT JOIN dbo.order_fulfillment f ON f.orderID = o.orderID
    WHERE ${where.join(' AND ')}
    ORDER BY o.createdate DESC, o.orderID DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `;

  const rs = await req.query(pageSql);

  // Armar salida con un bloque 'retryCustomer' útil para el reintento
  const rows = rs.recordset.map(r => ({
    orderID: r.orderID,
    salesChannelReferenceId: r.salesChannelReferenceId,
    u_ref1: r.u_ref1,

    // Información útil para diagnosticar
    integrationError: r.integrationError ?? null,
    origin: r.origin ?? null,
    hostname: r.hostname ?? null,
    createdate: r.createdate,
    updateDate: r.updateDate,
    orderStatusID: r.orderStatusID,
    customerIntegrated: r.customerIntegrated ?? 0,
    customerIntegratedAt: r.customerIntegratedAt ?? null,
    customerCardCode: r.customerCardCode ?? null,

    // Datos crudos de fulfillment
    fulfillment: {
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      email: r.email ?? null,
      currencyCode: r.currencyCode ?? null,
      documentType: r.documentType ?? null,
      document: r.document ?? null,
      phone: r.phone ?? null,
      isCorporate: r.isCorporate ?? null,
      giro: r.giro ?? null,
      cardname: r.cardname ?? null,
      addressType: r.addressType ?? null,
      receiverName: r.receiverName ?? null,
      postalCode: r.postalCode ?? null,
      city: r.city ?? null,
      country: r.country ?? null,
      state: r.state ?? null,
      street: r.street ?? null,
      number: r.number ?? null,
      neighborhood: r.neighborhood ?? null,
      referenceAddress: r.referenceAddress ?? null,
    },
  
  }));

  return { page: _page, pageSize: _pageSize, total, rows };
}



module.exports = {
  createOrderWithItems,
  patchOrder,
  getOrder,
  getOrdersPendingCustomerIntegration
};