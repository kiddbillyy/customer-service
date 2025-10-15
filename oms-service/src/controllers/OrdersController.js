

// 'use strict';
// const { listOrdersRich, getItemsByOrderIds } = require('../models/OrdersModel');
// const { formatDDMMYYYY_HHmmss_TZ } = require('../utils/dates');

// const DEFAULT_SELLER = process.env.OMS_DEFAULT_SELLER_NAME || 'VTEX-WEB';

// function buildPedido(salesChannelReferenceId, u_ref1) {
//   const a = String(salesChannelReferenceId ?? '').trim();
//   const b = String(u_ref1 ?? '').trim();
//   if (a && b) return `${a}-${b}`;
//   return a || b || '';
// }

// function buildDireccion({ street, number, neighborhood, city, country, referenceAddress }) {
//   const base = [
//     [street, number].filter(Boolean).join(' ').trim(),
//     neighborhood,
//     city,
//     country
//   ].filter(Boolean).join(', ');
//   if (referenceAddress) return `${base} (Ref: ${referenceAddress})`;
//   return base || null;
// }

// function cleanDeliveryCompany(name) {
//   if (!name) return name;
//   return String(name).replace(/\s*\([^)]*\)\s*$/g, '').trim();
// }

// async function getOrdersView(req, res) {
//   try {
//     // Filtros y paginación/sort desde querystring
//     const {
//       page,
//       pageSize,
//       q,
//       dateFrom,
//       dateTo,
//       sortBy,
//       sortDir,

//       // NUEVOS FILTROS
//       orderId,
//       u_ref1,
//       folioNum,
//       cliente,
//       orderStatusId,
//     } = req.query;

//     const { rows, total, page: p, pageSize: ps } = await listOrdersRich({
//       page,
//       pageSize,
//       q,
//       dateFrom,
//       dateTo,
//       sortBy,
//       sortDir,

//       // pasar filtros al modelo
//       orderId,     // numérico exacto
//       u_ref1,      // LIKE
//       folioNum,    // numérico exacto
//       cliente,     // nombre/document/cardcode
//       orderStatusId,  // código estado actual
//     });

//     const ids = rows.map(r => Number(r.orderID));
//     const itemsMap = await getItemsByOrderIds(ids);

//     const data = rows.map(r => ({
//       datosPedido: {
//         pedido:    buildPedido(r.salesChannelReferenceId, r.u_ref1),
//         orderId:   Number(r.orderID),
//         createdAt: r.createDate ? formatDDMMYYYY_HHmmss_TZ(r.createDate) : null,
//         seller:    DEFAULT_SELLER,
//       },
//       datosCliente: {
//         nombre: r.cardname ?? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
//         correo:  r.email || null,
//         celular: r.phone || null,
//         rut:    r.cardcode || r.document, 
//       },
//       datosEntrega: {
//           tipoEntrega:
//             r.addressType === 'residential'
//               ? 'Envio a Domicilio'
//               : r.addressType === 'pickup'
//                 ? 'Retiro en tienda Chorrillo'
//                 : r.addressType || null,
//         direccion:       buildDireccion({
//                           street: r.street, number: r.number,
//                           neighborhood: r.neighborhood, city: r.city,
//                           country: r.country, referenceAddress: r.referenceAddress
//                         }),
//         fechaEntrega:    r.deliveryDate ? formatDDMMYYYY_HHmmss_TZ(r.deliveryDate) : null,
//         empresaDelivery: cleanDeliveryCompany(r.deliveryCompany) || null,
//       },
//       picking: itemsMap[Number(r.orderID)] || [],
//       totales: {
//         total:    r.total != null ? Number(r.total) : null,
//         tipoPago: r.paymentType || null,
//       },
//       estado: {
//         id: r.orderStatusID || null, 
//         status: r.currStatusCode || r.histStatusCode || null,
//       },
//     }));

//     return res.json({
//       total,
//       page: p,
//       pageSize: ps,
//       sortBy: (['orderID','createDate'].includes(String(sortBy))) ? sortBy : 'orderID',
//       sortDir: String(sortDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
//       data,
//     });
//   } catch (e) {
//     console.error('getOrdersView error:', e);
//     return res.status(500).json({ error: 'INTERNAL_ERROR' });
//   }
// }

// module.exports = { getOrdersView };

'use strict';
const { listOrdersRich, getItemsByOrderIds } = require('../models/OrdersModel');
const { formatDDMMYYYY_HHmmss_TZ } = require('../utils/dates');

function buildPedido(salesChannelReferenceId, u_ref1) {
  const a = String(salesChannelReferenceId ?? '').trim();
  const b = String(u_ref1 ?? '').trim();
  if (a && b) return `${a}-${b}`;
  return a || b || '';
}

function buildDireccion({ street, number, neighborhood, city, country, referenceAddress }) {
  const base = [
    [street, number].filter(Boolean).join(' ').trim(),
    neighborhood,
    city,
    country
  ].filter(Boolean).join(', ');
  if (referenceAddress) return `${base} (Ref: ${referenceAddress})`;
  return base || null;
}

function cleanDeliveryCompany(name) {
  if (!name) return name;
  return String(name).replace(/\s*\([^)]*\)\s*$/g, '').trim();
}


function resolveOrderSellerDisplay(items = []) {
  const names = new Set(
    (items || [])
      .map(it => it?.sellerName)
      .filter(Boolean)
  );
  if (names.size === 0) return null;
  if (names.size === 1) return [...names][0];
  return [...names].join(', ');
}

function resolveOrderWhsDisplay(items = []) {
  const whs = new Set(
    (items || [])
      .map(it => it?.whscode)
      .filter(Boolean)
      .map(w => String(w).trim())
  );
  if (whs.size === 0) return null;
  if (whs.size === 1) return [...whs][0];
  return [...whs].join(', '); // si hay más de un almacén en la orden
}


async function getOrdersView(req, res) {
  try {
    // Filtros y paginación/sort desde querystring
    const {
      page,
      pageSize,
      q,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,

      // NUEVOS FILTROS
      orderId,
      u_ref1,
      folioNum,
      cliente,
      orderStatusId,
    } = req.query;

    const { rows, total, page: p, pageSize: ps } = await listOrdersRich({
      page,
      pageSize,
      q,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,

      orderId,       
      u_ref1,         
      folioNum,      
      cliente,        
      orderStatusId, 
    });

    const ids = rows.map(r => Number(r.orderID));
    const itemsMap = await getItemsByOrderIds(ids);

    const data = rows.map(r => {
      const orderIdNum = Number(r.orderID);
      const items = itemsMap[orderIdNum] || [];

      return {
        datosPedido: {
          pedido:    buildPedido(r.salesChannelReferenceId, r.u_ref1),
          orderId:   orderIdNum,
          createdAt: r.createDate ? formatDDMMYYYY_HHmmss_TZ(r.createDate) : null,
          seller:    resolveOrderSellerDisplay(items), 
        },
        datosCliente: {
          nombre:  r.cardname ?? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
          correo:  r.email || null,
          celular: r.phone || null,
          rut:     r.cardcode || r.document,
        },
        datosEntrega: {
          tipoEntrega:
            r.addressType === 'residential'
              ? 'Envio a Domicilio'
              : r.addressType === 'pickup'
                ? 'Retiro en tienda Chorrillo'
                : r.addressType || null,
          direccion: buildDireccion({
            street: r.street, number: r.number,
            neighborhood: r.neighborhood, city: r.city,
            country: r.country, referenceAddress: r.referenceAddress
          }),
          fechaEntrega:    r.deliveryDate ? formatDDMMYYYY_HHmmss_TZ(r.deliveryDate) : null,
          empresaDelivery: cleanDeliveryCompany(r.deliveryCompany) || null,
          whscode:         resolveOrderWhsDisplay(items),
        },
        picking: items,
        totales: {
          total:    r.total != null ? Number(r.total) : null,
          tipoPago: r.paymentType || null,
        },
        estado: {
          id: r.orderStatusID || null,
          status: r.currStatusCode || r.histStatusCode || null,
        },
      };
    });

    return res.json({
      total,
      page: p,
      pageSize: ps,
      sortBy: (['orderID','createDate'].includes(String(sortBy))) ? sortBy : 'orderID',
      sortDir: String(sortDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      data,
    });
  } catch (e) {
    console.error('getOrdersView error:', e);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

module.exports = { getOrdersView };
