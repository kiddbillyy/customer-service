//StatusInvoiceConsumer.js
'use strict';
const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');
const { Kafka } = require('kafkajs');

// ---- Config ----
const TOPIC_VTEX_STATUS = process.env.KAFKA_TOPIC_VTEX_STATUS || 'vtex.status';
const BROKERS = (process.env.KAFKA_BROKER || 'localhost:9092').split(',').map(s => s.trim());
const GROUP_ID = process.env.KAFKA_GROUP_VTEX_STATUS || 'oms-vtex-status-invoice';

// OMS API (para marcar estado "Pedido Facturado")
const OMS_API_BASE = process.env.OMS_API_BASE || 'http://localhost:5010';
const OMS_ORDERS_PATH = process.env.OMS_ORDERS_PATH || '/api/oms-service/orders';
const OMS_API_TOKEN = process.env.OMS_API_TOKEN || ''; // opcional: bearer
const OMS_VTEX_INVOICED_STATUS_CODE = process.env.OMS_VTEX_INVOICED_STATUS_CODE || 'Pedido Facturado';

// ---- Utils ----

// Parse seguro de JSON
function safeJson(bufOrStr) {
  try {
    const s = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString('utf8') : String(bufOrStr || '');
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

async function doFetch(url, options) {
  if (typeof fetch === 'function') return fetch(url, options);
  const mod = await import('node-fetch');
  return mod.default(url, options);
}

// ---- DB: obtener orderId por u_ref1 ----
async function getOrderIdByURef1(u_ref1) {
  await IdServicePoolConnect;

  const row = (await new sql.Request(IdServicePool)
    .input('uref1', sql.NVarChar(100), String(u_ref1))
    .query(`
      SELECT TOP 1 orderID
      FROM dbo.Orders WITH (NOLOCK)
      WHERE u_ref1 = @uref1
    `)
  ).recordset[0];

  return row ? Number(row.orderID) : null;
}

// ---- Llamada a OMS para cambiar estado ----
async function propagateOmsStatus({ orderId, statusCode }) {
  if (!orderId) {
    console.warn('[vtex-status] propagateOmsStatus: orderId faltante');
    return { ok: false, status: 0, body: null };
  }

  const url = `${OMS_API_BASE}${OMS_ORDERS_PATH}/${orderId}`;
  const headers = { 'Content-Type': 'application/json' };
  if (OMS_API_TOKEN) headers['Authorization'] = `Bearer ${OMS_API_TOKEN}`;

  const body = JSON.stringify({ orderStatusCode: String(statusCode) });

  const res = await doFetch(url, { method: 'PATCH', headers, body });

  const text = await res.text().catch(() => '');
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

  if (!res.ok) {
    console.error(`[vtex-status] OMS status PATCH fallo (${res.status}) orderId=${orderId}:`, parsed || text);
    return { ok: false, status: res.status, body: parsed };
  }

  console.log(`[vtex-status] OMS status PATCH OK orderId=${orderId}, code="${statusCode}"`);
  return { ok: true, status: res.status, body: parsed };
}

// ---- Normalización y reglas ----
function normalize(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalize(value).toLowerCase();
}

function shouldMarkAsInvoiced({ state, source }) {
  return normalizeLower(state) === 'invoiced' && normalizeLower(source) === 'finance';
}

// ---- Handler de mensajes ----
async function handleVtexStatus(message) {
  const payload = safeJson(message.value);

  const commerceId = payload.commerceId ?? payload.u_ref1 ?? payload.U_REF1 ?? null;
  const state  = payload.state;
  const source = payload.source;

  if (!commerceId) {
    console.warn('[vtex-status] faltó commerceId (u_ref1), mensaje ignorado:', payload);
    return;
  }

  if (!state || !source) {
    console.warn('[vtex-status] faltó state/source, mensaje ignorado:', { commerceId, payload });
    return;
  }

  // Sólo actuamos si es "invoiced" desde "finance"
  if (!shouldMarkAsInvoiced({ state, source })) {
    console.log('[vtex-status] evento no aplicable (state/source):', { commerceId, state, source });
    return;
  }

  // 1) Obtener orderId por u_ref1
  const u_ref1 = String(commerceId);
  const orderId = await getOrderIdByURef1(u_ref1);

  if (!orderId) {
    console.warn('[vtex-status] no existe order con u_ref1:', u_ref1);
    return;
  }

  // 2) Propagar estado "Pedido Facturado" al OMS
  try {
    await propagateOmsStatus({
      orderId,
      statusCode: OMS_VTEX_INVOICED_STATUS_CODE, 
    });
  } catch (e) {
    console.error('[vtex-status] Error al propagar estado a OMS:', e.message, { orderId, u_ref1 });
  }
}

// ---- Runner ----
async function startVtexStatusConsumer() {
  const kafka = new Kafka({ clientId: 'oms-vtex-status', brokers: BROKERS });
  const consumer = kafka.consumer({ groupId: GROUP_ID });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_VTEX_STATUS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        await handleVtexStatus(message);
      } catch (e) {
        console.error('Error procesando vtex.status:', e, {
          topic, partition, offset: message.offset
        });
      }
    },
  });

  const shutdown = async () => {
    try { await consumer.disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return consumer;
}

module.exports = { startVtexStatusConsumer };
