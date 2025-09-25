const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

const VALID_SORT = ['createDate','updateDate','deliveryDate','orderId'];
const toISO = d => d ? new Date(d).toISOString() : null;

async function getOrders(opts) {
  await IdServicePoolConnect;
  const sortBy   = VALID_SORT.includes(opts.sortBy) ? opts.sortBy : 'createDate';
  const sortOrd  = opts.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  // 1) Cabeceras paginadas (+ total)
  const req = IdServicePool.request();
  req.input('offset',   sql.Int, (opts.page - 1) * opts.pageSize);
  req.input('pageSize', sql.Int, opts.pageSize);

  const qHeads = `
    WITH Q AS (
      SELECT o.*, COUNT(*) OVER() AS totalRecords
      FROM dbo.Orders o
    )
    SELECT * FROM Q
    ORDER BY ${sortBy} ${sortOrd}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;
  const rsH = await req.query(qHeads);
  const heads = rsH.recordset || [];
  if (!heads.length) {
    return { page: opts.page, pageSize: opts.pageSize, totalRecords: 0, totalPages: 0, data: [] };
  }

  const orderIds = heads.map(r => r.orderID);

  // 2) Ítems
  const reqI = IdServicePool.request();
  orderIds.forEach((id, i) => reqI.input('o' + i, sql.VarChar(64), id));
  const inI = orderIds.map((_, i) => '@o' + i).join(',');
  const qItems = `
    SELECT *
    FROM dbo.Order_Items
    WHERE orderID IN (${inI})
    ORDER BY orderID, itemIndex, lineNum;
  `;
  const rsI = await reqI.query(qItems);
  const items = rsI.recordset || [];

  // 3) Fulfillment
  const reqF = IdServicePool.request();
  orderIds.forEach((id, i) => reqF.input('f' + i, sql.VarChar(64), id));
  const inF = orderIds.map((_, i) => '@f' + i).join(',');
  const qFul = `SELECT * FROM dbo.order_fullfillment WHERE orderID IN (${inF});`;
  const rsF = await reqF.query(qFul);
  const fulfillments = rsF.recordset || [];

  // 4) Status history + status
  const reqS = IdServicePool.request();
  orderIds.forEach((id, i) => reqS.input('s' + i, sql.VarChar(64), id));
  const inS = orderIds.map((_, i) => '@s' + i).join(',');
  const qSt = `
    SELECT h.orderID, h.orderStatusID, h.previousStatusID, h.changeDate,
           s.statusCode, s.description, s.createdAtUtc
    FROM dbo.order_status_history h
    JOIN dbo.order_status s ON s.orderStatusID = h.orderStatusID
    WHERE h.orderID IN (${inS})
    ORDER BY h.orderID, h.changeDate;
  `;
  const rsS = await reqS.query(qSt);
  const statuses = rsS.recordset || [];

  // 5) Mapear por orderID y armar respuesta
  const mapItems = new Map();
  for (const it of items) {
    const k = it.orderID;
    if (!mapItems.has(k)) mapItems.set(k, []);
    mapItems.get(k).push({
      id: it.id,
      itemIndex: it.itemIndex,
      uniqueId: it.uniqueId,
      lineNum: it.lineNum,
      itemcode: it.itemcode,
      description: it.dscription,
      quantity: it.quantity,
      priceAfterVAT: it.priceAfterVAT,
      codebarsFromOrder: it.codebars ? String(it.codebars).trim() : null,
      imageUrl: it.imageUrl || null,
      whscode: it.whscode || null,
      categoryLeafId: it.categoryLeafId || null,
      categoryLeafName: it.categoryLeafName || null,
      categoryPathIds: it.categoryPathIds || null,
      categoryPathNames: it.categoryPathNames || null,
      // placeholders (sin catálogo por ahora)
      barcodePrimary: null,
      barcodes: null
    });
  }

  const mapFul = new Map();
  for (const f of fulfillments) {
    mapFul.set(f.orderID, {
      firstName: f.firstName, lastName: f.lastName, email: f.email,
      currencyCode: f.currencyCode, documentType: f.documentType, document: f.document,
      phone: f.phone, isCorporate: f.isCorporate,
      giro: f.giro, addressType: f.addressType, receiverName: f.receiverName,
      postalCode: f.postalCode, city: f.city, country: f.country, state: f.state,
      street: f.street, number: f.number, neighborhood: f.neighborhood,
      referenceAddress: f.referenceAddress, cardname: f.cardname
    });
  }

  const mapStatus = new Map();
  for (const s of statuses) {
    const k = s.orderID;
    if (!mapStatus.has(k)) mapStatus.set(k, []);
    mapStatus.get(k).push({
      orderStatusID: s.orderStatusID,
      statusCode: s.statusCode,
      description: s.description,
      previousStatusID: s.previousStatusID,
      changeDate: toISO(s.changeDate),
      statusCreatedAtUtc: toISO(s.createdAtUtc)
    });
  }

  const data = heads.map(h => ({
    orderId: h.orderID,
    header: {
      salesChannelReferenceId: h.salesChannelReferenceId,
      u_ref1: h.u_ref1,
      itemsAmount: h.itemsAmount,
      doctotalsy: h.doctotalsy,
      orderStatusID: h.orderStatusID,
      deliveryDate: toISO(h.deliveryDate),
      lastQueryDate: toISO(h.lastQueryDate),
      createDate: toISO(h.createdate),
      updateDate: toISO(h.updateDate),
      integrationError: h.integrationError,
      origin: h.origin,
      hostname: h.hostname,
      invoiceDocNum: h.InvoiceDocNum,
      docEntryInvoice: h.DocEntryInvoice,
      folioNum: h.folionum,
      shippingEstimate: h.shippingEstimate,
      deliveryCompany: h.deliveryCompany,
      customerIntegrated: h.customerIntegrated,
      customerIntegratedAt: toISO(h.customerIntegratedAt),
      customerCardCode: h.customerCardCode
    },
    fulfillment: mapFul.get(h.orderID) || null,
    items: mapItems.get(h.orderID) || [],
    statuses: mapStatus.get(h.orderID) || []
  }));

  const totalRecords = heads[0]?.totalRecords ?? data.length;
  return {
    page: opts.page,
    pageSize: opts.pageSize,
    totalRecords,
    totalPages: Math.ceil(totalRecords / opts.pageSize),
    data
  };
}

async function getOrderById(orderId) {
  await IdServicePoolConnect;

  const head = (await IdServicePool.request()
    .input('orderId', sql.VarChar(64), orderId)
    .query('SELECT * FROM dbo.Orders WHERE orderID = @orderId;')
  ).recordset?.[0];
  if (!head) return null;

  const it = (await IdServicePool.request()
    .input('orderId', sql.VarChar(64), orderId)
    .query('SELECT * FROM dbo.Order_Items WHERE orderID = @orderId ORDER BY itemIndex, lineNum;')
  ).recordset || [];

  const f = (await IdServicePool.request()
    .input('orderId', sql.VarChar(64), orderId)
    .query('SELECT * FROM dbo.order_fullfillment WHERE orderID = @orderId;')
  ).recordset?.[0] || null;

  const st = (await IdServicePool.request()
    .input('orderId', sql.VarChar(64), orderId)
    .query(`
      SELECT h.orderID, h.orderStatusID, h.previousStatusID, h.changeDate,
             s.statusCode, s.description, s.createdAtUtc
      FROM dbo.order_status_history h
      JOIN dbo.order_status s ON s.orderStatusID = h.orderStatusID
      WHERE h.orderID = @orderId
      ORDER BY h.changeDate;
    `)
  ).recordset || [];

  return {
    orderId: head.orderID,
    header: {
      salesChannelReferenceId: head.salesChannelReferenceId,
      u_ref1: head.u_ref1,
      itemsAmount: head.itemsAmount,
      doctotalsy: head.doctotalsy,
      orderStatusID: head.orderStatusID,
      deliveryDate: toISO(head.deliveryDate),
      lastQueryDate: toISO(head.lastQueryDate),
      createDate: toISO(head.createdate),
      updateDate: toISO(head.updateDate),
      integrationError: head.integrationError,
      origin: head.origin,
      hostname: head.hostname,
      invoiceDocNum: head.InvoiceDocNum,
      docEntryInvoice: head.DocEntryInvoice,
      folioNum: head.folionum,
      shippingEstimate: head.shippingEstimate,
      deliveryCompany: head.deliveryCompany,
      customerIntegrated: head.customerIntegrated,
      customerIntegratedAt: toISO(head.customerIntegratedAt),
      customerCardCode: head.customerCardCode
    },
    fulfillment: f && {
      firstName: f.firstName, lastName: f.lastName, email: f.email,
      currencyCode: f.currencyCode, documentType: f.documentType, document: f.document,
      phone: f.phone, isCorporate: f.isCorporate,
      giro: f.giro, addressType: f.addressType, receiverName: f.receiverName,
      postalCode: f.postalCode, city: f.city, country: f.country, state: f.state,
      street: f.street, number: f.number, neighborhood: f.neighborhood,
      referenceAddress: f.referenceAddress, cardname: f.cardname
    },
    items: it.map(x => ({
      id: x.id,
      itemIndex: x.itemIndex,
      uniqueId: x.uniqueId,
      lineNum: x.lineNum,
      itemcode: x.itemcode,
      description: x.dscription,
      quantity: x.quantity,
      priceAfterVAT: x.priceAfterVAT,
      codebarsFromOrder: x.codebars ? String(x.codebars).trim() : null,
      imageUrl: x.imageUrl || null,
      whscode: x.whscode || null,
      categoryLeafId: x.categoryLeafId || null,
      categoryLeafName: x.categoryLeafName || null,
      categoryPathIds: x.categoryPathIds || null,
      categoryPathNames: x.categoryPathNames || null,
      barcodePrimary: null,
      barcodes: null
    })),
    statuses: st.map(s => ({
      orderStatusID: s.orderStatusID,
      statusCode: s.statusCode,
      description: s.description,
      previousStatusID: s.previousStatusID,
      changeDate: toISO(s.changeDate),
      statusCreatedAtUtc: toISO(s.createdAtUtc)
    }))
  };
}

module.exports = { getOrders, getOrderById };
