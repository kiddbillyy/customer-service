const dayjs = require("dayjs");
const { parseAcquirer, deriveCuotas, deriveLast4, pickRule } = require("../domain/paymentRules");
const {getPaymentIntakeByOrderId} = require("../models/FinancePayments.Model")
/* function buildIncomingPaymentPayload({ order, invoiceDocEntry, invoiceAmountDecimal }) {
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
 */

async function buildIncomingPaymentPayload({ orderId, invoiceDocEntry, invoiceAmountDecimal, cardCode }) {
  if (!orderId) throw new Error("orderId es requerido");
  if (!(Number.isFinite(invoiceDocEntry) || invoiceDocEntry === 0)) throw new Error("invoiceDocEntry requerido");
  if (!cardCode) {
    const err = new Error("CARD_CODE_REQUIRED");
    err.code = "CARD_CODE_REQUIRED";
    throw err;
  }
  // 1) Traer intake (DB) y orden (para CardCode) en paralelo
  const intake = await getPaymentIntakeByOrderId(orderId);


  // 2) Determinar regla y campos de pago
  const { code, cuotasTxt } = parseAcquirer({
    acquirer: intake.acquirer,
    message: intake.message
  });

  const rule = pickRule({
    code,
    message: intake.message,
    paymentSystemName: intake.paymentSystemName
  });

  const cuotasEf = deriveCuotas({
    detected: cuotasTxt,
    installments: intake.installments,
    rule
  });

  const tid = intake.tid || "";
  const last4 = deriveLast4({ last4: intake.last4, tid });

  // 3) Monto: si no lo pasan, se infiere de valueCents (dos decimales)
  const amount = Number.isFinite(invoiceAmountDecimal)
    ? Number(invoiceAmountDecimal)
    : Number((Number(intake.valueCents || 0) / 100).toFixed(2));

  const today = dayjs().format("YYYY-MM-DD");

  // 4) Payload SAP
  return {
    CardCode: cardCode,
    DocType: "rCustomer",
    DocDate: today,
    TaxDate: today,
    DueDate: today,
    DocCurrency: "CLP",
    PaymentInvoices: [{
      DocEntry: invoiceDocEntry,
      InvoiceType: "it_Invoice",
      SumApplied: amount
    }],
    PaymentCreditCards: [{
      LineNum: 0,
      CreditCard: rule.formaPago,
      PaymentMethodCode: rule.formaPago,
      CreditAcct: rule.cuenta,
      CreditCardNumber: `**** **** **** ${last4}`,
      NumOfPayments: cuotasEf,
      VoucherNum: tid,
      ConfirmationNum: tid,
      CardValidUntil: `${dayjs().add(10, "year").year()}-01-01T00:00:00`,
      CreditSum: amount,
      SplitPayments: cuotasEf > 1 ? "tYES" : "tNO"
    }]
  };
}

module.exports = { buildIncomingPaymentPayload };
