const dayjs = require("dayjs");
const paymentMap = require("../domain/paymentMap");

function buildIncomingPaymentPayload({ order, invoiceDocEntry, invoiceAmountDecimal }) {
  const trx = order.payments || {};
  const rawAcq = trx.acquirer || trx.message || "";
  const parts = rawAcq.split("-").map(s => s.trim());
  const acqCode = parts[0] || "";
  const cuotasTxt = parts[1];

  const cuotasDetectadas = Number.isFinite(+cuotasTxt) ? parseInt(cuotasTxt, 10) : (trx.installments || 1);
  const tid = trx.tid || "";
  const last4 = trx.last4 || (tid.length >= 4 ? tid.slice(-4) : "");

  // match insensible a mayúsculas
  const findKeyInsensitive = (k) => Object.keys(paymentMap).find(pk => pk.toLowerCase() === String(k).toLowerCase());
  const key = findKeyInsensitive(acqCode) || findKeyInsensitive(trx.message) || "VN";
  const rule = paymentMap[key] || paymentMap["VN"];

  const cuotasEf = (rule.isVC && cuotasDetectadas > 12) ? 1 : cuotasDetectadas;
  const today = dayjs().format("YYYY-MM-DD");

  return {
    CardCode    : order.customer.cardCode,
    DocType     : "rCustomer",
    DocDate     : today,
    TaxDate     : today,
    DueDate     : today,
    DocCurrency : "CLP",
    PaymentInvoices: [{
      DocEntry   : invoiceDocEntry,
      InvoiceType: "it_Invoice",
      SumApplied : invoiceAmountDecimal
    }],
    PaymentCreditCards: [{
      LineNum           : 0,
      CreditCard        : rule.formaPago,
      PaymentMethodCode : rule.formaPago,
      CreditAcct        : rule.cuenta,
      CreditCardNumber  : `**** **** **** ${last4}`,
      NumOfPayments     : cuotasEf,
      VoucherNum        : tid,
      ConfirmationNum   : tid,
      CardValidUntil    : `${dayjs().add(10, "year").year()}-01-01T00:00:00`,
      CreditSum         : invoiceAmountDecimal,
      SplitPayments     : cuotasEf > 1 ? 'tYES' : 'tNO'
    }]
  };
}

module.exports = { buildIncomingPaymentPayload };
