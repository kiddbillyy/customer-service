// // src/mappers/toSapInvoice.js
// const { isCorporate, toDecimal, freightNetFromGross } = require("../domain/rules");

// // Defaults vía ENV
// const DIM1 = process.env.SAP_DIM1 || 'CC';
// const DIM2 = process.env.SAP_DIM2 || 'FERR';
// const WAREHOUSE_DEFAULT = process.env.SAP_WAREHOUSE || '01';
// const SALESPERSON_CODE = Number(process.env.SAP_SALESPERSON_CODE || 401);
// const DOC_CURRENCY = process.env.SAP_DOC_CURRENCY || 'CLP';
// const USE_INDICATOR = process.env.SAP_USE_INDICATOR === 'true';

// const SERIES_BOLETA  = 151; 
// const SERIES_FACTURA = 139; // factura electrónica
// const INDIC_BOLETA   = 39;  // SII
// const INDIC_FACTURA  = 33;  
// const FACTURARESERVA = "tYES"; // 
// const FACTURA = "tNO"; // "tNO" = factura normal
// //
// function buildReserveInvoicePayload(order) {
//   const isCorp  = isCorporate(order);
//   const serie   = isCorp ? SERIES_FACTURA : SERIES_BOLETA;
//   const indicator = isCorp ? INDIC_FACTURA : INDIC_BOLETA; // opcional

//   const DocumentLines = (order.items || []).map(p => {
//     const gross   = toDecimal(p.priceAfterVAT);   // viene con IVA en pesos
//     const unitNet = freightNetFromGross(gross);   // bruto/1.19 → neto

//     return {
//       ItemCode      : p.itemcode,
//       Quantity      : Number(p.quantity || 0) || 1,
//       UnitPrice     : unitNet,                  
//       WarehouseCode : p.whscode || WAREHOUSE_DEFAULT,
//       SalesPersonCode: SALESPERSON_CODE,
//       TaxCode       : "IVA",
//       CostingCode   : DIM1,                    
//       CostingCode2  : DIM2                     
//     };
//   });

//   const today = new Date().toISOString().slice(0, 10);

//   const payload = {
//     CardCode       : order.customer.cardCode,
//     DocDate        : today,
//     DocDueDate     : today,
//     Series         : serie,
//     ReserveInvoice : "tYES", //tNO
//     U_REF1         : order.orderId,
//     SalesPersonCode: SALESPERSON_CODE,           
//     DocCurrency    : DOC_CURRENCY,              
//     DocumentLines,
//     Comments       : `Orden ${order.orderId} - Generada por OMS-SERVICE`
//   };

//   if (USE_INDICATOR) payload.Indicator = indicator; 

//   return payload;
// }

// module.exports = { buildReserveInvoicePayload, SERIES_BOLETA, SERIES_FACTURA };


// src/mappers/toSapInvoice.js
const { isCorporate, toDecimal, freightNetFromGross } = require("../domain/rules");

// Defaults vía ENV
const DIM1 = process.env.SAP_DIM1 || 'CC';
const DIM2 = process.env.SAP_DIM2 || 'FERR';
const WAREHOUSE_DEFAULT = process.env.SAP_WAREHOUSE || '01';
const SALESPERSON_CODE = Number(process.env.SAP_SALESPERSON_CODE || 401);
const DOC_CURRENCY = process.env.SAP_DOC_CURRENCY || 'CLP';
const USE_INDICATOR = process.env.SAP_USE_INDICATOR === 'true';

const SERIES_BOLETA  = 151; 
const SERIES_FACTURA = 139; // factura electrónica
const INDIC_BOLETA   = 39;  // SII
const INDIC_FACTURA  = 33;  
const FACTURARESERVA = "tYES"; // 
const FACTURA = "tNO"; // "tNO" = factura normal
//
function buildReserveInvoicePayload(order) {
  const isCorp  = isCorporate(order);
  const serie   = isCorp ? SERIES_FACTURA : SERIES_BOLETA;
  const indicator = isCorp ? INDIC_FACTURA : INDIC_BOLETA; // opcional

  // NUEVO: salesperson header desde OMS (sin romper fallback existente)
  const headerSalesPerson = Number(order?.seller ?? SALESPERSON_CODE) || SALESPERSON_CODE;

  const DocumentLines = (order.items || []).map(p => {
    const gross   = toDecimal(p.priceAfterVAT);   // viene con IVA en pesos
    const unitNet = freightNetFromGross(gross);   // bruto/1.19 → neto

    // NUEVO: salesperson por línea (item.seller > header > ENV)
    const lineSalesPerson = Number(p?.seller ?? headerSalesPerson) || headerSalesPerson;

    return {
      ItemCode      : p.itemcode,
      Quantity      : Number(p.quantity || 0) || 1,
      UnitPrice     : unitNet,

      // NUEVO: warehouse desde OMS por línea con fallback al default existente
      WarehouseCode : (p.whscode != null && p.whscode !== '') ? p.whscode : WAREHOUSE_DEFAULT,

      // NUEVO: SalesPersonCode también en la línea
      SalesPersonCode: lineSalesPerson,

      // NUEVO: tomar Tax/Costing desde OMS si vienen; mantener defaults si no
      TaxCode       : p.taxCode || "IVA",
      CostingCode   : p.costingCode || DIM1,
      CostingCode2  : p.costingCode2 || DIM2
    };
  });

  const today = new Date().toISOString().slice(0, 10);

  const payload = {
    CardCode       : order.customer.cardCode,
    DocDate        : today,
    DocDueDate     : today,
    Series         : serie,

    // NUEVO: decide reserva/normal según OMS
    ReserveInvoice : order?.isReservationInvoice ? FACTURARESERVA : FACTURA,

    U_REF1         : order.orderId,

    // NUEVO: SalesPersonCode en encabezado desde OMS, con fallback intacto
    SalesPersonCode: headerSalesPerson,

    DocCurrency    : DOC_CURRENCY,
    DocumentLines,
    Comments       : `Orden ${order.orderId} - Generada por OMS-SERVICE`
  };

  if (USE_INDICATOR) payload.Indicator = indicator; 

  return payload;
}

module.exports = { buildReserveInvoicePayload, SERIES_BOLETA, SERIES_FACTURA };
