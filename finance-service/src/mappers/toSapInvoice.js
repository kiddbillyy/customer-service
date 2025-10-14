// src/mappers/toSapInvoice.js
const { isCorporate, toDecimal, freightNetFromGross } = require("../domain/rules");

// Defaults vía ENV
const DIM1 = process.env.SAP_DIM1 || 'CC';
const DIM2 = process.env.SAP_DIM2 || 'FERR';
const WAREHOUSE_DEFAULT = process.env.SAP_WAREHOUSE || '01';
const SALESPERSON_CODE = Number(process.env.SAP_SALESPERSON_CODE || 401);
const DOC_CURRENCY = process.env.SAP_DOC_CURRENCY || 'CLP';
const USE_INDICATOR = process.env.SAP_USE_INDICATOR === 'true'; // opcional

const SERIES_BOLETA  = 151; // boleta electrónica
const SERIES_FACTURA = 139; // factura electrónica
const INDIC_BOLETA   = 39;  // SII
const INDIC_FACTURA  = 33;  // SII
//
function buildReserveInvoicePayload(order) {
  const isCorp  = isCorporate(order);
  const serie   = isCorp ? SERIES_FACTURA : SERIES_BOLETA;
  const indicator = isCorp ? INDIC_FACTURA : INDIC_BOLETA; // opcional

  const DocumentLines = (order.items || []).map(p => {
    const gross   = toDecimal(p.priceAfterVAT);   // viene con IVA en pesos
    const unitNet = freightNetFromGross(gross);   // bruto/1.19 → neto

    return {
      ItemCode      : p.itemcode,
      Quantity      : Number(p.quantity || 0) || 1,
      UnitPrice     : unitNet,                  
      WarehouseCode : p.whscode || WAREHOUSE_DEFAULT,
      TaxCode       : "IVA",
      CostingCode   : DIM1,                    
      CostingCode2  : DIM2                     
    };
  });

  const today = new Date().toISOString().slice(0, 10);

  const payload = {
    CardCode       : order.customer.cardCode,
    DocDate        : today,
    DocDueDate     : today,
    Series         : serie,
    ReserveInvoice : "tYES",
    U_REF1         : order.orderId,
    SalesPersonCode: SALESPERSON_CODE,           
    DocCurrency    : DOC_CURRENCY,              
    DocumentLines,
    Comments       : `Orden ${order.orderId} - Generada por OMS-SERVICE`
  };

  if (USE_INDICATOR) payload.Indicator = indicator; 

  return payload;
}

module.exports = { buildReserveInvoicePayload, SERIES_BOLETA, SERIES_FACTURA };
