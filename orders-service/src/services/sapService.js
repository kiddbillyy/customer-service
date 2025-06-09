// src/services/sapService.js
const axios  = require("axios");
const dayjs  = require("dayjs");
const https  = require("https");
const OrdersRepository = require("../models/ordersRepository.js");
const { fetchVtexOrder, setOrderStartHandling} = require("./vtexService.js");
const paymentMap  = require("../constants/paymentMaps.js");

const baseURL    = process.env.SAP_SL_BASE_URL;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────
function buildReserveInvoicePayload({ orderRow, docEntry, products }) {
  // DocumentLines que “referencian” la OV (BaseEntry/Line)
  const docLines = products
    .filter(p => p.lineNum !== null)           // descarta líneas sin LineNum
    .map(p => ({
      BaseType  : 17,                          // 17 = Sales Order
      BaseEntry : docEntry,
      BaseLine  : p.lineNum,
      Quantity  : p.quantity                   // respeta cantidades originales
    }));

  const { cardCode } = parseRut(orderRow.cardcode || "");

  return {
    CardCode        : cardCode,
    DocDate         : dayjs(orderRow.createdate).format("YYYY-MM-DD"),
    DocDueDate      : dayjs(orderRow.createdate).format("YYYY-MM-DD"),
    U_REF1          : orderRow.u_ref1,        // orderId VTEX – lo usa createInvoiceInSap
    ReserveInvoice  : "tYES",                 // ← CLAVE
    SalesPersonCode : 401,                    // usa el que corresponda (ej. 401)
    /* ——— LÍNEAS ——— */
    DocumentLines   : docLines
  };
}


function profileFields(vtexOrder) {
  const p = vtexOrder.clientProfileData;
  const isCorp = !!(p?.corporateName && p.corporateName.trim());

  return isCorp
    ? {
        rutRaw   : p.corporateDocument,          // ← RUT empresa (sin DV)
        cardName : p.corporateName.trim().toUpperCase(),
        phone    : p.corporatePhone || p.phone,  // fallback al phone normal
        isCorp
      }
    : {
        rutRaw   : p.document,                   // ← RUT consumidor (con DV)
        cardName : `${p.firstName} ${p.lastName}`.trim().toUpperCase(), 
        phone    : p.phone,
        isCorp
      };
}

function dv(clean) {
  let m = 0, s = 1;
  for (; clean; clean = ~~(clean / 10))
    s = (s + clean % 10 * (9 - m++ % 6)) % 11;
  return s ? String(s - 1) : "K";
}

function parseRut(doc) {
  const raw = String(doc).trim();
  let body, ver;

  if (raw.includes("-")) {
    [body, ver] = raw.split("-");
  } else {
    body = raw.slice(0, -1);
    ver  = raw.slice(-1);
  }

  body = body.replace(/\D/g, "");
  ver  = (ver || dv(body)).toUpperCase();

  return {
    clean   : body,
    dv      : ver,
    federal : `${body}-${ver}`,
    cardCode: `${body}C`       // sin dígito verificador
  };
}

// ──────────────────────────────────────────────────────────
// Login Service Layer 
// ──────────────────────────────────────────────────────────
async function loginToSap() {
  const { SAP_SL_COMPANYDB, SAP_SL_USER, SAP_SL_PASSWORD } = process.env;
  const url = `${baseURL}/Login`;

  const { data, headers } = await axios.post(
    url,
    { CompanyDB: SAP_SL_COMPANYDB, UserName: SAP_SL_USER, Password: SAP_SL_PASSWORD },
    { httpsAgent, headers:{ "Content-Type":"application/json", Accept:"application/json" }, timeout:15_000 }
  );

  const cookie = headers["set-cookie"]
    .map(c => c.split(";")[0])
    .join("; ");

  console.log("✅ Login SAP OK – session:", data.SessionId);
  return cookie;
}

// ──────────────────────────────────────────────────────────
// Campos que sincronizamos y detectamos diferencias
// ──────────────────────────────────────────────────────────
const FIELDS_TO_SYNC = [
  "CardName",
  "Phone1",
  "EmailAddress",
  "Notes",
  "FederalTaxID"
];

function diffBp(remote, local) {
  const changes = {};
  for (const f of FIELDS_TO_SYNC) {
    if ((remote[f] ?? "") !== (local[f] ?? "")) {
      changes[f] = local[f];
    }
  }
  return changes;
}

// ──────────────────────────────────────────────────────────
// Construye payload de BusinessPartner
// ──────────────────────────────────────────────────────────
function buildSapCustomerPayload(vtexOrder, giroNombre) {
  const { rutRaw, cardName, phone, isCorp } = profileFields(vtexOrder);

  const sel  = vtexOrder.shippingData?.selectedAddresses?.[0]
            || vtexOrder.shippingData?.address || {};
  const rut  = parseRut(rutRaw || "");

  const street = `${sel.street || "-"}${sel.number ? " " + sel.number : ""}${sel.complement ? " " + sel.complement : ""}`;
  const city   = sel.city || sel.state || "";

  return {
    CardCode     : rut.cardCode,                // ← cuerpo + "C"
    CardName     : cardName,                    // ← empresa o cliente
    CardType     : "cCustomer",
    GroupCode    : 100,
    Phone1       : phone,
    Notes        : giroNombre || (isCorp ? "Empresa" : "Particular"),
    EmailAddress : vtexOrder.clientProfileData.email,
    FederalTaxID : rut.federal,                 // ← cuerpo + "-" + DV
    Currency     : "CLP",
    BPAddresses  : [
      {
        AddressName: "Envio",
        AddressType: "bo_ShipTo",
        Street     : street,
        City       : city,
        Country    : "CL"
      },
      {
        AddressName: "Facturación",
        AddressType: "bo_BillTo",
        Street     : street,
        City       : city,
        Country    : "CL"
      }
    ]
  };
}

// ──────────────────────────────────────────────────────────
// Crea o actualiza BusinessPartner
// ──────────────────────────────────────────────────────────
async function upsertCustomer(vtexOrder) {
  const cookie     = await loginToSap();
  const giroCodigo = vtexOrder.clientProfileData?.stateInscription;
  const giroNombre = giroCodigo
    ? await OrdersRepository.getInscription(giroCodigo)
    : null;

  const payload = buildSapCustomerPayload(vtexOrder, giroNombre);
  const bpURL   = `${baseURL}/BusinessPartners('${payload.CardCode}')`;

  // 1) Intentar GET para ver si existe
  let remoteBP = null;
  try {
    const res = await axios.get(
      bpURL,
      { httpsAgent, headers:{ Cookie:cookie, Accept:"application/json" }, timeout:10_000 }
    );
    remoteBP = res.data;
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error("❌ No se pudo comprobar el BP:", err.response?.data || err.message);
      throw err;
    }
  }

  // 2A) Si no existe, POST para crear
  if (!remoteBP) {
    console.log("📄 Payload BP a crear:", JSON.stringify(payload, null, 2));
    await axios.post(
      `${baseURL}/BusinessPartners`,
      payload,
      { httpsAgent, headers:{ Cookie:cookie, "Content-Type":"application/json", Accept:"application/json" }, timeout:15_000 }
    );
    console.log(`✅ Cliente creado en SAP: ${payload.CardCode}`);
    return;
  }

  // 2B) Si existe, ver si cambió algo y PATCH
  const changes = diffBp(remoteBP, payload);
  if (Object.keys(changes).length === 0) {
    console.log(`ℹ️ BP ${payload.CardCode} sin cambios.`);
    return;
  }
  console.log("🔄 Cambios detectados en BP:", changes);

  await axios.patch(
    bpURL,
    changes,
    { httpsAgent, headers:{ Cookie:cookie, "Content-Type":"application/json", Accept:"application/json" }, timeout:15_000 }
  );
  console.log(`✅ BP ${payload.CardCode} actualizado.`);
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────


function centsToFixed(c) {                         
  const s = String(Math.trunc(c));
  const int = s.slice(0, -2) || "0";
  const dec = s.slice(-2).padStart(2, "0");
  return `${int}.${dec}`;
}

// ──────────────────────────────────────────────────────────
// Construye payload de Orden de Venta (OV)
// ──────────────────────────────────────────────────────────
const IVA_FACTOR        = 1.19;   // 19 %
const PAYMENT_GROUP_SAP = -1;     // siempre “contado”
const INDIC_BOLETA      = 39;     // doc. electrónico: boleta
const INDIC_FACTURA     = 33;     // doc. electrónico: factura

function buildSapOrderPayload(orderRow, products, vtexOrder) {
  /* 1) CardCode y tipo de documento ----------------------- */
  const { cardCode } = parseRut(orderRow.cardcode || "");

  // ←––––– se decide en tiempo real, leyendo el profile de la orden VTEX
  const hasRazonSocial = !!(
    vtexOrder.clientProfileData?.corporateName &&
    vtexOrder.clientProfileData.corporateName.trim()
  );
  const indicator = hasRazonSocial ? INDIC_FACTURA : INDIC_BOLETA;

  /* 2) Líneas --------------------------------------------- */
  const docLines = products.map(p => {
    /* ——— FLETE → UnitPrice SIN IVA ——— */
    if (p.itemcode === "701001008") {
      const net = +(p.priceAfterVAT / IVA_FACTOR).toFixed(2);   // 2 dec.
      return {
        ItemCode       : p.itemcode,
        Quantity       : "1",
        UnitPrice      : net,              // ¡neto!
        WarehouseCode  : "01",
        CostingCode    : "CC",
        CostingCode2   : "FERR",
        TaxCode        : "IVA"
      };
    }

    /* ——— PRODUCTOS normales → PriceAfterVAT ——— */
    return {
      ItemCode       : p.itemcode,
      Quantity       : String(p.quantity),
      PriceAfterVAT  : +(p.priceAfterVAT).toFixed(2),     // con IVA
      WarehouseCode  : p.whscode ?? "01",
      CostingCode    : "CC",
      CostingCode2   : "FERR",
      TaxCode        : "IVA"
    };
  });

  /* 3) Payload final -------------------------------------- */
  return {
    CardCode         : cardCode,
    DocDate          : dayjs(orderRow.createdate).format("YYYY-MM-DD"),
    DocDueDate       : dayjs(orderRow.createdate).format("YYYY-MM-DD"),
    Series           : 13,
    PaymentGroupCode : PAYMENT_GROUP_SAP,   // ← NUEVO
    Indicator        : indicator,          // ← NUEVO
    SalesPersonCode  : 401,
    U_REF1           : orderRow.u_ref1,
    DocumentLines    : docLines,
    Comments         : "OV creada desde Service Layer."
  };
}


// ──────────────────────────────────────────────────────────
// Envía OV a SAP
// ──────────────────────────────────────────────────────────
async function sendToSap(vtexOrder, orderRow, products) {
  // 1) Asegura que el BP exista o esté actualizado
  await upsertCustomer(vtexOrder);

  // 2) Login & envío de la OV
  const cookie  = await loginToSap();
  const payload = buildSapOrderPayload(orderRow, products, vtexOrder);

  console.log("📦 Payload OV:", JSON.stringify(payload, null, 2));
  const { data } = await axios.post(
    `${baseURL}/Orders`,
    payload,
    {
      httpsAgent,
      headers: {
        Cookie        : cookie,
        "Content-Type": "application/json",
        Accept        : "application/json"
      },
      timeout: 15_000
    }
  );
  console.log("📤 Orden enviada a SAP B1 Service Layer");

  /** Construimos un array con los LineNum que nos devolvió SL */
  const lines = (data.DocumentLines || [])
    .sort((a, b) => a.LineNum - b.LineNum)           // por si vienen desordenados
    .map(l => ({ itemcode: l.ItemCode, lineNum: l.LineNum }));

  return {
    docEntry : data.DocEntry,
    docNum   : data.DocNum,
    lineInfo : lines                                 // ← nuevo
  };
}

/* ─────────────────────────────────────────────────────────
   CREA FACTURA /Invoices
   ───────────────────────────────────────────────────────── */
   // Series internas de SAP B1
const SERIES_BOLETA  = 151;   // boleta electrónica
const SERIES_FACTURA = 139;   // factura electrónica

async function createInvoiceInSap(payloadFromFrontend) {
  try {
  /* A) Obtener los datos de la orden VTEX para decidir la serie -------- */
  const vtexOrderId = payloadFromFrontend.U_REF1;          // debe venir del front
  if (!vtexOrderId) throw new Error("Falta U_REF1 (orderId VTEX)");

  const vtexOrder = await fetchVtexOrder(vtexOrderId);     

  const hasRazonSocial = !!(
    vtexOrder.clientProfileData?.corporateName &&
    vtexOrder.clientProfileData.corporateName.trim()
  );

  // 151 = boleta, 139 = factura
  const serieElegida = hasRazonSocial ? SERIES_FACTURA : SERIES_BOLETA;

  /* B) Construir payload para Service Layer (sobrescribimos Series) ---- */
  const payloadSL = {
    ...payloadFromFrontend,
    Series: serieElegida
  };

  /* C) Crear la factura de reserva en SAP ------------------------------ */
  const cookie = await loginToSap();

  const { data: inv } = await axios.post(
    `${baseURL}/Invoices`,
    payloadSL,
    {
      httpsAgent,
      headers: {
        Cookie        : cookie,
        "Content-Type": "application/json",
        Accept        : "application/json"
      },
      timeout: 15_000
    }
  );
  console.log(`📤 Factura creada (DocEntry=${inv.DocEntry}, Serie=${serieElegida})`);

  /* D) Calcular total reserva y ajustar ±$5 --------------------------- */
  const cardCode     = payloadFromFrontend.CardCode;
  let totalReserva   = inv.DocumentLines
    .reduce((acc, l) => acc + (l.PriceAfterVAT * l.Quantity), 0);

  const totalDif = inv.DocTotal - totalReserva;
  if (Math.abs(totalDif) <= 5) totalReserva = inv.DocTotal;

  /* E) Crear pago (IncomingPayments) ----------------------------------- */
  const { payDocEntry, payDocNum } = await createIncomingPaymentInSap({
    cardCode,
    invoiceDocEntry: inv.DocEntry,
    vtexOrderId,
    invoiceAmount : totalReserva
  });

  /* F) Devolver lo necesario al controlador --------------------------- */
  return {
    docEntry      : inv.DocEntry,
    docNum        : inv.DocNum,
    payDocEntry,
    payDocNum,
    invoiceAmount : totalReserva,
    vtexItems     : vtexOrder.items,
    documentLines : inv.DocumentLines?.map(l => ({
      lineNum : l.LineNum,
      itemCode: l.ItemCode,
      quantity: l.Quantity
    })) || []
  };
  }  catch (err) {
    // B) Error al crear la factura de reserva
    const orderId = payloadFromFrontend.U_REF1;
    const msg = JSON.stringify(err.response?.data || err.message);
    await OrdersRepository.saveIntegrationError(orderId, msg);
    console.error("❌ Error factura reserva:", msg);
    throw err; // re-lanzamos si quieres que el controlador lo capture
  }
}



/* -----------------------------------------------------------
  CREA PAGO luego de la reserva
------------------------------------------------------------ */
async function createIncomingPaymentInSap({ cardCode, invoiceDocEntry, vtexOrderId, invoiceAmount }) {
  try{
  // 1) Obtener datos de VTEX
  const vtexOrder = await fetchVtexOrder(vtexOrderId);
  const trx = vtexOrder.paymentData.transactions?.[0]?.payments?.[0];
  if (!trx) throw new Error("No se encontró información de pago en VTEX");

  // 1.1) Normalizar acquirer & extraer cuotas de texto
  const rawAcq      = trx.connectorResponses?.acquirer || trx.paymentSystemName || "";
  const [acqCode, cuotasAcqTxt] = rawAcq.split("-").map(s => s.trim());
  const acquirer    = acqCode;                              // e.g. "MercadoPagoV2" o "SI"
  const cuotasAcq   = parseInt(cuotasAcqTxt, 10);           // e.g. 3 o NaN
  const messageId   = (trx.connectorResponses?.Message || "").split("-")[0].trim();

  // 1.2) Tid, ReturnCode y últimos 4 dígitos
  const tid   = trx.connectorResponses?.Tid     || "";
  const rawRc = trx.connectorResponses?.ReturnCode;
  const last4 = rawRc ? rawRc.toString() : (tid.length >= 4 ? tid.slice(-4) : "");

  // 2) Determinar número de cuotas real
  const cuotasReal = !isNaN(cuotasAcq) && cuotasAcq > 0
    ? cuotasAcq
    : (trx.installments || 1);

  // 3) Resolver forma de pago / cuenta con búsqueda case-insensitive
  const findKeyInsensitive = k =>
    Object.keys(paymentMap).find(pk => pk.toLowerCase() === k.toLowerCase());

  let key = findKeyInsensitive(acquirer) || findKeyInsensitive(messageId) || "VN";
  const rule = paymentMap[key];   // { formaPago, cuenta, isVC? }

  // 4) Aplicar regla VC (si corresponde)
  const cuotasEf = (rule.isVC && cuotasReal > 12) ? 1 : cuotasReal;

  // 5) Construir payload para IncomingPayments
  const now = dayjs().format("YYYY-MM-DD");
  const payload = {
    CardCode       : cardCode,
    DocType        : "rCustomer",
    DocDate        : now,
    TaxDate        : now,
    DueDate        : now,
    DocCurrency    : "CLP",
    CashSum        : 0,
    TransferSum    : 0,
    PaymentInvoices: [{
      DocEntry   : invoiceDocEntry,
      InvoiceType: "it_Invoice",
      SumApplied : invoiceAmount
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
      CreditSum         : invoiceAmount
    }]
  };

  // 6) Enviar a SAP
  const cookie = await loginToSap();
  const { data } = await axios.post(
    `${baseURL}/IncomingPayments`,
    payload,
    {
      httpsAgent,
      headers: {
        Cookie        : cookie,
        "Content-Type": "application/json",
        Accept        : "application/json"
      },
      timeout: 15_000
    }
  );

  console.log(`💰 Pago creado en SAP (DocEntry=${data.DocEntry})`);
  return { payDocEntry: data.DocEntry, payDocNum: data.DocNum };
  } catch (err) {
    // C) Error al crear el pago
    const msg = JSON.stringify(err.response?.data || err.message);
    await OrdersRepository.saveIntegrationError(vtexOrderId, msg);
    console.error("❌ Error pago:", msg);
    throw err;
  }
}











/* ─────────────────────────────────────────────────────────
   CREA ENTREGA /DeliveryNotes
   ───────────────────────────────────────────────────────── */
async function createDeliveryNoteInSap(payloadFromFrontend) {
  // 1) Login
  const cookie = await loginToSap();

  // 2) POST /DeliveryNotes
  const url = `${baseURL}/DeliveryNotes`;
  const { data } = await axios.post(
    url,
    payloadFromFrontend,
    {
      httpsAgent,
      headers: {
        Cookie        : cookie,
        "Content-Type": "application/json",
        Accept        : "application/json"
      },
      timeout: 15_000
    }
  );

  console.log(
    `📤 Entrega creada (DocEntry=${data.DocEntry}, DocNum=${data.DocNum})`
  );

  /* devolvemos lo útil para el FE */
  return {
    docEntry      : data.DocEntry,
    docNum        : data.DocNum,
    documentLines : data.DocumentLines?.map(l => ({
      lineNum : l.LineNum,
      baseLine: l.BaseLine,   // útil si luego necesitas reconciliación
      itemCode: l.ItemCode,
      quantity: l.Quantity
    })) || []
  };
}


module.exports = {
  loginToSap,
  upsertCustomer,
  buildSapCustomerPayload,
  buildSapOrderPayload,
  sendToSap,
  createInvoiceInSap,
  createIncomingPaymentInSap,
  createDeliveryNoteInSap,
  buildReserveInvoicePayload 
};
