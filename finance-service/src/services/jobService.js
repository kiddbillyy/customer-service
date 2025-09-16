const { getOrder } = require("../infra/omsClient");
const { login, logout, post } = require("../infra/sapClient");
const { buildReserveInvoicePayload } = require("../mappers/toSapInvoice");
const { buildIncomingPaymentPayload } = require("../mappers/toSapPayment");
const { getState, saveState } = require("../repos/financeStateRepo");

async function processOrder(orderId) {
  const persisted = await getState(orderId);
  if (persisted?.done) return persisted;

  const order = await getOrder(orderId);
  const { cookie } = await login();

  try {
    // A) Factura de reserva
    let invoiceDocEntry = persisted?.invoiceDocEntry;
    let invoiceDocNum   = persisted?.invoiceDocNum;
    let invoiceDocTotal = persisted?.invoiceDocTotal;

    if (!invoiceDocEntry) {
      const invPayload = buildReserveInvoicePayload(order);
      const inv = await post("/Invoices", invPayload, cookie); // SL responde con DocEntry, DocNum, DocTotal
      invoiceDocEntry = inv.DocEntry;
      invoiceDocNum   = inv.DocNum;
      invoiceDocTotal = inv.DocTotal; // usar total devuelto por SAP
      await saveState(orderId, { invoiceDocEntry, invoiceDocNum, invoiceDocTotal });
    }

    // B) Pago
    let payDocEntry = persisted?.payDocEntry;
    let payDocNum   = persisted?.payDocNum;

    if (!payDocEntry) {
      // Monto a aplicar = total de la factura de reserva (ajusta si usas otra regla)
      const payPayload = buildIncomingPaymentPayload({
        order,
        invoiceDocEntry,
        invoiceAmountDecimal: Number(Number(invoiceDocTotal).toFixed(2))
      });
      const pay = await post("/IncomingPayments", payPayload, cookie);
      payDocEntry = pay.DocEntry;
      payDocNum   = pay.DocNum;
      await saveState(orderId, { payDocEntry, payDocNum });
    }

    // C) Entrega (opcional) — si la haces en este paso
    // const dnPayload = buildDeliveryPayload({ order, baseDocEntry: invoiceDocEntry });
    // const dn = await post("/DeliveryNotes", dnPayload, cookie);
    // await saveState(orderId, { dnDocEntry: dn.DocEntry, dnDocNum: dn.DocNum });

    await saveState(orderId, { done: true });
    return await getState(orderId);
  } finally {
    await logout(cookie);
  }
}

module.exports = { processOrder };
