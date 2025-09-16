function buildDeliveryPayload({ order, baseDocEntry, lines }) {
  // `lines` puede venir del Invoices/Orders response si quieres referenciar BaseEntry/BaseLine
  const DocumentLines = (order.items || []).map((p, idx) => ({
    ItemCode     : p.itemcode,
    Quantity     : Number(p.quantity || 0),
    WarehouseCode: p.whscode || "01",
    BaseType     : 13, // 13 = Invoice; 17 si referenciaras Sales Order
    BaseEntry    : baseDocEntry,
    BaseLine     : (lines && lines[idx] != null) ? lines[idx] : undefined
  }));

  const today = new Date().toISOString().slice(0, 10);
  return {
    DocDate     : today,
    DocDueDate  : today,
    CardCode    : order.customer.cardCode,
    DocumentLines
  };
}

module.exports = { buildDeliveryPayload };
