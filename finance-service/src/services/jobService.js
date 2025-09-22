// services/jobService.js
const { getOrder } = require("../infra/omsClient");
const { login, logout, post, get} = require("../infra/sapClient");
const { buildReserveInvoicePayload } = require("../mappers/toSapInvoice");
// const { buildIncomingPaymentPayload } = require("../mappers/toSapPayment");
const { getState, saveState } = require("../repos/financeStateRepo");


async function processOrder(orderId) {

  const persisted = await getState(orderId);
  if (persisted?.done) {
    return persisted;
  }

  // 1) Datos de la orden desde el OMS
  const order = await getOrder(orderId);

  // 2) Login a SAP
  const { cookie } = await login();

  try {

    let invoiceDocEntry = persisted?.invoiceDocEntry;
    let invoiceDocNum   = persisted?.invoiceDocNum;
    let invoiceDocTotal = persisted?.invoiceDocTotal;
    let invoiceFolioNum = persisted?.invoiceFolioNum; 

    // A) Crear factura de reserva si no existe aún
    if (!invoiceDocEntry) {
      const invPayload = buildReserveInvoicePayload(order);
      const inv = await post("/Invoices", invPayload, cookie);

      invoiceDocEntry = inv.DocEntry;
      invoiceDocNum   = inv.DocNum;
      invoiceDocTotal = inv.DocTotal;
      invoiceFolioNum = inv.FolioNum ?? null; 

      await saveState(orderId, {
        invoiceDocEntry,
        invoiceDocNum,
        invoiceDocTotal,
        invoiceFolioNum,
      });
    }

    if (invoiceDocEntry && (invoiceFolioNum === undefined || invoiceFolioNum === null)) {
      // GET /Invoices({DocEntry})
      const inv = await get(`/Invoices(${invoiceDocEntry})`, cookie);
      invoiceFolioNum = inv?.FolioNum ?? null;

      if (invoiceFolioNum !== null) {
        await saveState(orderId, { invoiceFolioNum });
      }
    }

    // // C) (Opcional) Generar pago contra la factura de reserva
    // let payDocEntry = persisted?.payDocEntry;
    // let payDocNum   = persisted?.payDocNum;
    // if (!payDocEntry) {
    //   const payPayload = buildIncomingPaymentPayload({
    //     order,
    //     invoiceDocEntry,
    //     invoiceAmountDecimal: Number(Number(invoiceDocTotal).toFixed(2)),
    //   });
    //   const pay = await post("/IncomingPayments", payPayload, cookie);
    //   payDocEntry = pay.DocEntry;
    //   payDocNum   = pay.DocNum;
    //   await saveState(orderId, { payDocEntry, payDocNum });
    // }


    await saveState(orderId, { done: true });

    const finalState = await getState(orderId);
    return {
      ...finalState,
      invoiceDocEntry,
      invoiceDocNum,
      invoiceDocTotal,
      invoiceFolioNum,
    };
  } finally {
    await logout(cookie);
  }
}

module.exports = { processOrder };
