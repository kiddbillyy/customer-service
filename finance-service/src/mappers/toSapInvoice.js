const { isCorporate, centsToDecimal, freightNetFromGrossCents } = require("../domain/rules");

// Series internas SAP (ajústalas)
const SERIES_BOLETA  = 151;
const SERIES_FACTURA = 139;

function buildReserveInvoicePayload(order) {
  const serie = isCorporate(order) ? SERIES_FACTURA : SERIES_BOLETA;

  const DocumentLines = (order.items || []).map(p => {
    if (p.itemcode === "701001008") {
      // Flete: UnitPrice neto (decimal), qty 1
      return {
        ItemCode     : p.itemcode,
        Quantity     : 1,
        UnitPrice    : freightNetFromGrossCents(p.priceAfterVAT),
        WarehouseCode: p.whscode || "01",
        TaxCode      : "IVA"
      };
    }
    // Productos: PriceAfterVAT (decimal)
    return {
      ItemCode      : p.itemcode,
      Quantity      : Number(p.quantity || 0),
      PriceAfterVAT : centsToDecimal(p.priceAfterVAT),
      WarehouseCode : p.whscode || "01",
      TaxCode       : "IVA"
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  return {
    CardCode       : order.customer.cardCode,
    DocDate        : today,
    DocDueDate     : today,
    Series         : serie,
    ReserveInvoice : "tYES",
    U_REF1         : order.orderId,
    DocumentLines
  };
}

module.exports = { buildReserveInvoicePayload, SERIES_BOLETA, SERIES_FACTURA };
