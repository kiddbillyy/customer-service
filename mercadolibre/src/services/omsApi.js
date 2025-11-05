// src/services/omsApi.js
import axios from 'axios';

const OMS_BASE_URL = process.env.OMS_BASE_URL;          // p.ej. http://host.docker.internal:5015
const OMS_API_KEY  = process.env.OMS_API_KEY || '';     // opcional

/** Idempotencia por orden (estable) */
export function buildIdempotencyKey(orderId) {
  return `meli:${orderId}`;
}

/**
 * Construye el payload EXACTO requerido por tu OMS (según tu ejemplo).
 * Usa datos de /orders y (opcional) del /shipments para domicilio/phone.
 *
 * @param {object} order   JSON de GET /orders/{id}
 * @param {object|null} shipment JSON de GET /shipments/{id} (puede ser null)
 */
export function buildOmsPayloadMimbral(order, shipment = null) {
  // --- Campos fijos según tu contrato ---
  const salesChannelReferenceId = 'MER-001';
  const u_ref1 = String(order?.id ?? '');
  const orderStatusCode = 'Pedido Nuevo';
  const doctotalsy = Number(order?.total_amount ?? 0);
  const valuesInCents = false;
  const origin = 'full';
  const hostname = 'mercadolibre.cl';
  const shippingEstimate = '3db';
  const deliveryCompany = 'MEL Distribution';

  // Fecha de entrega: si no tienes otra, usa date_closed o date_created
  const deliveryDateISO = (() => {
    const src = order?.date_closed || order?.date_created || new Date().toISOString();
    return new Date(src).toISOString();
  })();

  // --- Comprador / Fulfillment ---
  const firstName = order?.buyer?.first_name || '';
  const lastName  = order?.buyer?.last_name  || '';

  // Datos de envío (si hay shipment, preferimos su address)
  const addr = shipment?.receiver_address || {};
  const phone =
    shipment?.receiver_phone ||
    addr?.receiver_phone ||
    ''; // ML puede no exponer teléfono público

  const receiverName =
    addr?.receiver_name ||
    `${firstName} ${lastName}`.trim();

  const street = addr?.street_name || '';
  const number = addr?.street_number != null ? String(addr.street_number) : '';
  const neighborhood = (addr?.neighborhood && (addr.neighborhood.name || addr.neighborhood)) || '';
  const city        = (addr?.city && (addr.city.name || addr.city)) || '';
  const state       = (addr?.state && (addr.state.name || addr.state)) || '';
  const country     = (addr?.country && (addr.country.id || addr.country)) || 'CL';
  const postalCode  = addr?.zip_code || '';
  const referenceAddress = addr?.comment || shipment?.comments || '';

  // Documento: si tienes lógica de RUT, colócala aquí;
  // por ahora usamos billing_info.id si existe.
  const document = order?.buyer?.billing_info?.id || '';

  // --- Items ---
  const items = (order?.order_items || []).map((it, idx) => {
    const prd = it?.item || {};
    return {
      itemIndex: idx,
      uniqueId: prd.id || prd.user_product_id || String(idx + 1),
      itemcode: prd.seller_sku || prd.id || '',
      dscription: prd.title || '',
      quantity: Number(it?.quantity ?? 1),
      priceAfterVAT: Number(it?.unit_price ?? 0), // CLP con IVA incluido
      codebars: prd.seller_custom_field || prd.id || '',
      imageUrl: '',
      categoryLeafId: null,
      categoryLeafName: null,
      categoryPathIds: null,
      categoryPathNames: null,
      seller: "355",
      costingCode: 'VTA_FULL', //SE CREA VTA_FULL EN SAP
      costingCode2: 'FERR',//TRAER CENTRO COSTO
      taxCode: 'IVA',
      whscode:'05',
      
    };
  });

  return {
    salesChannelReferenceId,
    u_ref1,
    orderStatusCode,
    doctotalsy,
    valuesInCents,
    deliveryDate: deliveryDateISO,
    origin,
    hostname,
    shippingEstimate,
    deliveryCompany,
    isReservationInvoice: "1",
    seller: "355",
    customerCardCode:'55555555C',
    fulfillment: {
      firstName,
      lastName,
      email: '',                           // ML no expone email real
      phone,
      isCorporate: false,
      currencyCode: order?.currency_id || 'CLP',
      documentType: 'RUT',
      document,
      addressType: 'residential',
      receiverName,
      street,
      number,
      neighborhood,
      city,
      state,
      country,
      postalCode,
      referenceAddress,
      notes: ''
    },
    items
  };
}

/**
 * Envía la orden al OMS (POST /oms/orders) con Idempotency-Key.
 * Imprime el payload cuando LOG_LEVEL=debug.
 */
export async function sendOrderToOms(payload, { idempotencyKey }) {
  if (!OMS_BASE_URL) throw new Error('Falta OMS_BASE_URL en .env');

  const url = `${OMS_BASE_URL.replace(/\/+$/, '')}/orders`;
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey
  };
  if (OMS_API_KEY) headers['X-API-Key'] = OMS_API_KEY;

  // Log del request (sin secretos) si estás en debug
  if ((process.env.LOG_LEVEL || '').toLowerCase() === 'debug') {
    const safeHeaders = { ...headers, 'X-API-Key': OMS_API_KEY ? '[redacted]' : undefined };
    console.log('[OMS][HTTP][REQUEST]', { url, headers: safeHeaders, body: payload });
  }

  const { data } = await axios.post(url, payload, { headers, timeout: 15000 });
  return data;
}
