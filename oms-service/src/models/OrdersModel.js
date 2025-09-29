// 'use strict';
// const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

// async function listOrdersRich({
//   page = 1,
//   pageSize = 50,
//   q = null,
//   dateFrom = null,
//   dateTo = null,
//   sortBy = 'orderID',
//   sortDir = 'DESC',
// } = {}) {
//   await IdServicePoolConnect;

//   const sortCol = (['orderID','createDate'].includes(String(sortBy))) ? sortBy : 'orderID';
//   const dir = (String(sortDir).toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

//   const req = new sql.Request(IdServicePool);
//   const where = [];

//   if (q) {
//     req.input('q', sql.NVarChar(200), `%${String(q).trim()}%`);
//     where.push('(o.u_ref1 LIKE @q OR o.salesChannelReferenceId LIKE @q)');
//   }
//   if (dateFrom) {
//     req.input('dateFrom', sql.DateTime2, new Date(dateFrom));
//     where.push('o.createDate >= @dateFrom');
//   }
//   if (dateTo) {
//     req.input('dateTo', sql.DateTime2, new Date(dateTo));
//     where.push('o.createDate <  @dateTo');
//   }
//   const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

//   // total
//   const totalRow = (await req.query(`
//     SELECT COUNT(1) AS total
//     FROM dbo.Orders o WITH (NOLOCK)
//     ${whereSql};
//   `)).recordset?.[0];
//   const total = Number(totalRow?.total || 0);

//   // paginación
//   const limit  = Math.max(1, Math.min(500, Number(pageSize)));
//   const offset = Math.max(0, (Number(page) - 1) * limit);
//   req.input('limit',  sql.Int, limit);
//   req.input('offset', sql.Int, offset);

//   // SIN CTE: usamos ROW_NUMBER() en un derived table
//   const rows = (await req.query(`
//     SELECT
//       o.orderID,
//       o.salesChannelReferenceId,
//       o.u_ref1,
//       o.createDate,

//       -- cliente (order_fulfillment)
//       f.firstName,
//       f.lastName,
//       f.email,
//       f.phone,

//       -- entrega
//       o.deliveryDate,
//       o.deliveryCompany,
//       f.addressType,
//       f.country,
//       f.city,
//       f.street,
//       f.number,
//       f.neighborhood,
//       f.referenceAddress,

//       -- totales/pago (ajusta si tu columna real es otra)
//       o.doctotalsy AS total,
//       o.origin    AS paymentType,

//       -- estado actual (por FK) y/o último en historial
//       curr.statusCode AS currStatusCode,
//       hist.statusCode AS histStatusCode,
//       hist.changeDate AS lastChangeDate
//     FROM (
//       SELECT
//         o.orderID,
//         ROW_NUMBER() OVER (ORDER BY o.${sortCol} ${dir}) AS rn
//       FROM dbo.Orders o WITH (NOLOCK)
//       ${whereSql}
//     ) p
//     JOIN dbo.Orders o WITH (NOLOCK) ON o.orderID = p.orderID
//     LEFT JOIN dbo.order_fulfillment f ON f.orderID = o.orderID
//     LEFT JOIN dbo.order_status curr   ON curr.orderStatusID = o.orderStatusID
//     OUTER APPLY (
//       SELECT TOP (1) s.statusCode, h.changeDate
//       FROM dbo.order_status_history h WITH (READPAST)
//       JOIN dbo.order_status s ON s.orderStatusID = h.orderStatusID
//       WHERE h.orderID = o.orderID
//       ORDER BY h.changeDate DESC, h.historyID DESC
//     ) hist
//     WHERE p.rn BETWEEN (@offset + 1) AND (@offset + @limit)
//     ORDER BY o.${sortCol} ${dir};
//   `)).recordset || [];

//   return { rows, total, page: Number(page), pageSize: limit };
// }

// async function getItemsByOrderIds(orderIds = []) {
//   if (!orderIds.length) return {};
//   await IdServicePoolConnect;

//   const req = new sql.Request(IdServicePool);
//   const inParams = orderIds.map((id, i) => {
//     const name = `id${i}`;
//     req.input(name, sql.Int, Number(id));
//     return `@${name}`;
//   }).join(',');

//   const rs = (await req.query(`
//     SELECT
//       oi.orderID,
//       item     = oi.itemcode,
//       producto = oi.dscription,
//       cantidad = oi.quantity,
//       lineNum  = oi.lineNum
//     FROM dbo.Order_Items oi WITH (NOLOCK)
//     WHERE oi.orderID IN (${inParams})
//     ORDER BY oi.orderID, lineNum;
//   `)).recordset || [];

//   const map = {};
//   for (const r of rs) {
//     const oid = Number(r.orderID);
//     if (!map[oid]) map[oid] = [];
//     map[oid].push({
//       producto: r.producto || null,
//       item:     r.item || null,
//       cantidad: r.cantidad != null ? Number(r.cantidad) : null,
//     });
//   }
//   return map;
// }

// module.exports = { listOrdersRich, getItemsByOrderIds };



'use strict';
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

function parseDateRange(dateFrom, dateTo) {
  const out = {};
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d)) {
      d.setHours(0, 0, 0, 0);
      out.from = d;
    }
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d)) {
      // fin de día para que sea inclusivo
      d.setHours(23, 59, 59, 999);
      out.to = d;
    }
  }
  return out;
}

async function listOrdersRich({
  page = 1,
  pageSize = 50,
  q = null,              // legado: buscar en u_ref1 / salesChannelReferenceId (LIKE)
  dateFrom = null,       // inclusivo
  dateTo = null,         // inclusivo
  sortBy = 'orderID',
  sortDir = 'DESC',

  // Filtros nuevos/ajustados
  orderId = null,        // numérico, igualdad
  u_ref1 = null,         // LIKE (contiene)
  folioNum = null,       // numérico, igualdad
  cliente = null,        // nombre / document (fulfillment) / cardcode (orders)
  orderStatusId  = null,     // código estado actual
} = {}) {
  await IdServicePoolConnect;

  const sortCol = (['orderID','createDate'].includes(String(sortBy))) ? sortBy : 'orderID';
  const dir = (String(sortDir).toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  const req = new sql.Request(IdServicePool);
  const where = [];

  // ===== Fechas inclusivas en Orders.createDate =====
  const rng = parseDateRange(dateFrom, dateTo);
  if (rng.from) {
    req.input('dateFrom', sql.DateTime2, rng.from);
    where.push('o.createDate >= @dateFrom');
  }
  if (rng.to) {
    req.input('dateTo', sql.DateTime2, rng.to);
    where.push('o.createDate <= @dateTo');
  }

  // ===== Filtros numéricos exactos =====
  if (orderId != null && String(orderId).trim() !== '') {
    req.input('orderId', sql.Int, Number(orderId));
    where.push('o.orderID = @orderId');
  }
  if (folioNum != null && String(folioNum).trim() !== '') {
    req.input('folioNum', sql.Int, Number(folioNum));
    where.push('o.folioNum = @folioNum');
  }

  // ===== u_ref1 LIKE (contiene) =====
  if (u_ref1) {
    req.input('u_ref1', sql.NVarChar(200), `%${String(u_ref1).trim()}%`);
    where.push('o.u_ref1 LIKE @u_ref1');
  }

  // ===== Filtro "q" legado (lo mantengo) =====
  if (q) {
    req.input('q', sql.NVarChar(200), `%${String(q).trim()}%`);
    where.push('(o.u_ref1 LIKE @q OR o.salesChannelReferenceId LIKE @q)');
  }

  // ===== Cliente: nombre / document (fulfillment) / cardcode (orders) =====
  if (cliente) {
    const cli = String(cliente).trim();
    req.input('cli_like', sql.NVarChar(200), `%${cli}%`);
    where.push(`(
      f.firstName LIKE @cli_like
      OR f.lastName LIKE @cli_like
      OR f.document LIKE @cli_like
      OR CAST(o.customerCardCode AS NVARCHAR(100)) LIKE @cli_like
    )`);
  }

  // ===== statusCode (estado actual) =====
  if (orderStatusId != null && String(orderStatusId).trim() !== '') {
    req.input('orderStatusId', sql.Int, Number(orderStatusId));
    where.push('o.orderStatusID = @orderStatusId');
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // total
  const totalRow = (await req.query(`
    SELECT COUNT(1) AS total
    FROM dbo.Orders o WITH (NOLOCK)
    LEFT JOIN dbo.order_fulfillment f ON f.orderID = o.orderID
    LEFT JOIN dbo.order_status curr   ON curr.orderStatusID = o.orderStatusID
    ${whereSql};
  `)).recordset?.[0];
  const total = Number(totalRow?.total || 0);

  // paginación
  const limit  = Math.max(1, Math.min(500, Number(pageSize)));
  const offset = Math.max(0, (Number(page) - 1) * limit);
  req.input('limit',  sql.Int, limit);
  req.input('offset', sql.Int, offset);

  // consulta paginada
  const rows = (await req.query(`
    SELECT
      o.orderID,
      o.salesChannelReferenceId,
      o.u_ref1,
      o.createDate,
      o.folioNum,
      o.customerCardCode,

      -- cliente (order_fulfillment)
      f.firstName,
      f.lastName,
      f.email,
      f.phone,
      f.document,

      -- entrega
      o.deliveryDate,
      o.deliveryCompany,
      f.addressType,
      f.country,
      f.city,
      f.street,
      f.number,
      f.neighborhood,
      f.referenceAddress,

      -- totales/pago
      o.doctotalsy AS total,
      o.origin     AS paymentType,

      -- estado actual y último historial
      curr.statusCode AS currStatusCode,
      hist.statusCode AS histStatusCode,
      hist.changeDate AS lastChangeDate
    FROM (
      SELECT
        o.orderID,
        ROW_NUMBER() OVER (ORDER BY o.${sortCol} ${dir}) AS rn
      FROM dbo.Orders o WITH (NOLOCK)
      LEFT JOIN dbo.order_fulfillment f ON f.orderID = o.orderID
      LEFT JOIN dbo.order_status curr   ON curr.orderStatusID = o.orderStatusID
      ${whereSql}
    ) p
    JOIN dbo.Orders o WITH (NOLOCK) ON o.orderID = p.orderID
    LEFT JOIN dbo.order_fulfillment f ON f.orderID = o.orderID
    LEFT JOIN dbo.order_status curr   ON curr.orderStatusID = o.orderStatusID
    OUTER APPLY (
      SELECT TOP (1) s.statusCode, h.changeDate
      FROM dbo.order_status_history h WITH (READPAST)
      JOIN dbo.order_status s ON s.orderStatusID = h.orderStatusID
      WHERE h.orderID = o.orderID
      ORDER BY h.changeDate DESC, h.historyID DESC
    ) hist
    WHERE p.rn BETWEEN (@offset + 1) AND (@offset + @limit)
    ORDER BY o.${sortCol} ${dir};
  `)).recordset || [];

  return { rows, total, page: Number(page), pageSize: limit };
}

async function getItemsByOrderIds(orderIds = []) {
  if (!orderIds.length) return {};
  await IdServicePoolConnect;

  const req = new sql.Request(IdServicePool);
  const inParams = orderIds.map((id, i) => {
    const name = `id${i}`;
    req.input(name, sql.Int, Number(id));
    return `@${name}`;
  }).join(',');

  const rs = (await req.query(`
    SELECT
      oi.orderID,
      item     = oi.itemcode,
      producto = oi.dscription,
      cantidad = oi.quantity,
      lineNum  = oi.lineNum
    FROM dbo.Order_Items oi WITH (NOLOCK)
    WHERE oi.orderID IN (${inParams})
    ORDER BY oi.orderID, lineNum;
  `)).recordset || [];

  const map = {};
  for (const r of rs) {
    const oid = Number(r.orderID);
    if (!map[oid]) map[oid] = [];
    map[oid].push({
      producto: r.producto || null,
      item:     r.item || null,
      cantidad: r.cantidad != null ? Number(r.cantidad) : null,
    });
  }
  return map;
}

module.exports = { listOrdersRich, getItemsByOrderIds };
