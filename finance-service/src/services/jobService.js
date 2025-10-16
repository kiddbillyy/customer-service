// services/jobService.js
const { getOrder } = require("../infra/omsClient");
const { login, logout, post, get} = require("../infra/sapClient");
const { buildReserveInvoicePayload } = require("../mappers/toSapInvoice");
const { buildIncomingPaymentPayload } = require("../mappers/toSapPayment");
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

    let cardCodeForPayment = null;
    let invoiceObj = null;

    // A) Crear factura de reserva si no existe aún
    if (!invoiceDocEntry) {
      const invPayload = buildReserveInvoicePayload(order);
      console.log("Cardcode del payload de la factura de reserva: ",invPayload)

      const normalizedCard = invPayload.CardCode != null
        ? String(invPayload.CardCode).trim().toUpperCase()
        : null;
      cardCodeForPayment = normalizedCard;
      const inv = await post("/Invoices", invPayload, cookie);
      invoiceObj      = inv;
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

    const needsFolio   = (invoiceFolioNum === undefined || invoiceFolioNum === null);
    const needsCard    = !cardCodeForPayment;
    const needsLines   = !(invoiceObj?.DocumentLines && invoiceObj.DocumentLines.length > 0);


   if (invoiceDocEntry && (needsFolio || needsCard || needsLines)) {
      const inv = await get(`/Invoices(${invoiceDocEntry})`, cookie);
      if (!invoiceObj) invoiceObj = inv;
      //invoiceObj = invoiceObj || inv; // preferimos conservar si ya la teníamos

      if (needsFolio) {
        invoiceFolioNum = inv?.FolioNum ?? null;
        if (invoiceFolioNum !== null) {
          await saveState(orderId, { invoiceFolioNum });
        }
      }
      if (needsCard && !cardCodeForPayment) {
        cardCodeForPayment = inv?.CardCode || null;
      }
    }

    let payDocEntry = persisted?.payDocEntry;
    let payDocNum   = persisted?.payDocNum;

    if (!payDocEntry) {
      if (!cardCodeForPayment) {
        const e = new Error("CARD_CODE_NOT_FOUND");
        e.code = "CARD_CODE_NOT_FOUND";
        throw e;
      }
      // Monto: usa el total de la factura (2 decimales). Si lo omites,
      // el mapper puede inferir desde valueCents del intake.

      if (!invoiceObj) {
        invoiceObj = await get(`/Invoices(${invoiceDocEntry})`, cookie);
      }
      const invoiceCardCode = String(invoiceObj?.CardCode || "").trim();
      //const invoiceAmountDecimal = Number(Number(invoiceDocTotal).toFixed(2));
      cardCodeForPayment = invoiceCardCode
      let totalReserva = invoiceObj.DocumentLines
        .reduce((acc, l) => acc + (l.PriceAfterVAT * l.Quantity), 0);

      const totalDif = invoiceObj.DocTotal - totalReserva;
      if (Math.abs(totalDif) <= 5) totalReserva = invoiceObj.DocTotal;
      ///aqui iba

      const payPayload = await buildIncomingPaymentPayload({
        orderId,
        invoiceDocEntry,
        invoiceAmountDecimal: totalReserva,
        cardCode: cardCodeForPayment,
      });
      console.log("Payload que se envia al crear la factura: ",payPayload)
      const pay = await post("/IncomingPayments", payPayload, cookie);
      payDocEntry = pay.DocEntry;
      payDocNum   = pay.DocNum; 

      await saveState(orderId, { payDocEntry, payDocNum });
    }


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
