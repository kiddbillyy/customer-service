// utils/kafka/consumers/CustomerOkConsumer.js
const { Kafka } = require('kafkajs');
const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');
const { fetchVtexOrder } = require('../../../service/vtexService');
const { buildOmsPayload } = require('../../../services/omsMapper');
const { postOrderToOms } = require('../../../services/omsService');

const TOPIC   = process.env.KAFKA_TOPIC_ORDER_STATUS || 'vtex.order.integration';
const BROKERS = (process.env.KAFKA_BROKER || '').split(',').filter(Boolean);

function safeJson(bufOrStr) {
  try {
    const s = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString('utf8') : String(bufOrStr || '');
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function parseOrderMessage(message) {
  const headers = Object.fromEntries(
    Object.entries(message.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? '')])
  );
  const payload = safeJson(message.value);

  const orderId =
    payload.orderId ?? payload.OrderId ?? payload.ORDERID ??
    payload.orderID ?? headers['orderid'] ?? headers['x-orderid'] ?? null;

  let state =
    payload.state ?? payload.State ?? payload.STATE ??
    headers['state'] ?? headers['x-state'] ?? null;

  let status =
    payload.status ?? payload.Status ?? payload.STATUS ??
    headers['status'] ?? headers['x-status'] ?? null;

  if (!state && status) state = status;
  if (!status && state) status = state;

  if (!orderId || typeof orderId !== 'string') throw new Error('VTEX_MSG_INVALID_ORDERID');
  if (!state  || typeof state  !== 'string')   throw new Error('VTEX_MSG_INVALID_STATE');

  return { orderId, state, status, payload, headers };
}

// ---------- persistencia ----------
async function persistOrderAndStatus({ commerceId, creationDateIso, state, status }) {
  await IdServicePoolConnect;

  const tx = new sql.Transaction(IdServicePool);
  await tx.begin();
  try {
    // 1) Buscar si ya existe por commerceId (con lock)
    const findReq = new sql.Request(tx)
      .input('commerceId', sql.NVarChar(100), commerceId);

    const cur = (await findReq.query(`
      SELECT id, creationDate
      FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
      WHERE commerceId = @commerceId;
    `)).recordset[0];

    if (cur) {
      console.log('🚫 orders skip (ya existe):', { commerceId, id: cur.id });
      await tx.commit();
      return { orderPkId: Number(cur.id), created: false };
    }

    // 2) Insertar nueva orden (primera vez)
    const creationDate = creationDateIso ? new Date(creationDateIso) : null;

    const insReq = new sql.Request(tx)
      .input('commerceId',        sql.NVarChar(100), commerceId)
      .input('ref_salesChannel',  sql.NVarChar(100), 'VTE-001')
      .input('ref_accountId',     sql.NVarChar(100), 'VTE-97c2f7cb0cd04c72b6a344a3cd12c1ec')
      .input('creationDate',      sql.DateTime2(3),  creationDate)
      .input('source',            sql.NVarChar(50),  'VTEX');

    const inserted = await insReq.query(`
      INSERT INTO dbo.Orders (commerceId, ref_salesChannelId, ref_accountId, creationDate, source, insertedAt, updatedAt)
      VALUES (@commerceId, @ref_salesChannel, @ref_accountId, @creationDate, @source, SYSUTCDATETIME(), NULL);
      SELECT SCOPE_IDENTITY() AS id;
    `);

    const orderPkId = Number(inserted.recordset[0].id);
    console.log('🆕 Orders insert id=', orderPkId, 'commerceId=', commerceId);

    // 3) Registrar el primer estado SOLO en la creación inicial
    const src     = 'VTEX';
    const _state  = String(state).slice(0, 40);
    const _status = String(status ?? state).slice(0, 20);

    const oscReq = new sql.Request(tx)
      .input('orderId', sql.Int,          orderPkId)
      .input('source',  sql.NVarChar(30), src)
      .input('state',   sql.NVarChar(40), _state)
      .input('status',  sql.NVarChar(20), _status);

    await oscReq.query(`
      INSERT INTO dbo.OrderStatusChange (orderId, source, state, status, dateCreated, dateModified)
      VALUES (@orderId, @source, @state, @status, SYSUTCDATETIME(), NULL);
    `);

    await tx.commit();
    console.log('✅ OrderStatusChange insert (inicial) ok → orderId=', orderPkId);
    return { orderPkId, created: true };
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error('❌ persistOrderAndStatus error:', e.message);
    throw e;
  }
}

function getResponseData(resp) {
  if (!resp) return null;
  if (resp && typeof resp === 'object' && 'data' in resp && resp.data != null) return resp.data;
  return resp;
}

function extractOmsOrderOutcome(resp) {
  const data = getResponseData(resp);
  const id = data?.id ?? null;
  const message = data?.message ?? null;

  if (message === 'ORDER_EXISTS') {
    return { status: 'ORDER_EXISTS', id: id != null ? String(id) : null, message };
  }
  if (id != null) {
    return { status: 'CREATED', id: String(id), message: message ?? null, itemsInserted: data?.itemsInserted ?? null };
  }
  return { status: 'UNKNOWN', id: null, message };
}

async function updateOrderWithOmsId(orderPkId, omsOrderId) {
  await IdServicePoolConnect;
  const req = new sql.Request(IdServicePool)
    .input('orderPkId', sql.Int, orderPkId)
    .input('omsOrderId', sql.NVarChar(100), String(omsOrderId));
  await req.query(`
    UPDATE dbo.Orders
    SET ref_omsOrderId = @omsOrderId,
        updatedAt      = SYSUTCDATETIME(),
        statusIntegration = 1
    WHERE id = @orderPkId;
  `);
}

async function setOrderErrorIntegration(orderPkId, errorText) {
  await IdServicePoolConnect;
  const text = errorText == null ? null : String(errorText).slice(0, 512);
  const req = new sql.Request(IdServicePool)
    .input('orderPkId', sql.Int, orderPkId)
    .input('err', sql.NVarChar(512), text);
  await req.query(`
    UPDATE dbo.Orders
    SET errorIntegration = @err,
        updatedAt        = SYSUTCDATETIME()
    WHERE id = @orderPkId;
  `);
}

function normalizeOmsError(e) {
  const msg = e?.response?.data?.message ?? e?.message ?? null;
  const KNOWN = new Set([
    'STATUS_NOT_FOUND',
    'ORDER_EXISTS',
    'ITEM_INDEX_REQUIRED',
    'DUPLICATE_ITEM_INDEX',
    'ITEM_REQUIRED_FIELDS',
  ]);
  if (msg && KNOWN.has(msg)) return msg;

  // HTTP con body string "ORDER_EXISTS", etc.
  if (typeof e?.response?.data === 'string' && KNOWN.has(e.response.data)) return e.response.data;

  // errores de red comunes
  if (e?.code === 'ECONNREFUSED') return 'OMS_UNREACHABLE';
  if (e?.code === 'ETIMEDOUT')    return 'OMS_TIMEOUT';

  return msg ? `OMS_POST_FAILED: ${String(msg).slice(0,80)}` : 'OMS_POST_FAILED';
}

// ---------- consumer ----------
async function handleVtexOrderMessage(message, ctx) {
  const { topic, partition, offset } = ctx;
  const { orderId, state, status } = parseOrderMessage(message);

  console.log(`📥 [${topic}|p${partition}|o${offset}] orderId=${orderId}, state=${state}, status=${status}`);

  // 1) Obtener VTEX (si falla, seguimos con persist pero omitimos el POST)
  let vtexData = null;
  try {
    vtexData = await fetchVtexOrder(orderId);
  } catch (e) {
    console.warn(`⚠️ VTEX fetch fallo para ${orderId}: ${e.message}`);
  }

  // 2) Persistir en OMS_VTEX_DB (solo crea si no existe)
  const { orderPkId, created } = await persistOrderAndStatus({
    commerceId: orderId,
    creationDateIso: vtexData?.creationDate || null,
    state,
    status
  });

  // 3) POST al OMS solo si es creación inicial y tenemos detalle de VTEX
  if (!created) {
    console.log('↩️  OMS POST omitido (orden ya existente)', { orderPkId, commerceId: orderId });
    return;
  }
  if (!vtexData) {
    console.warn('⚠️ OMS POST omitido: no hay detalle VTEX', { orderPkId, commerceId: orderId });
    return;
  }

  try {
    const payload  = buildOmsPayload(vtexData, { orderId, state, status });
    console.log('📦 OMS payload (preview 1k):', JSON.stringify(payload).slice(0, 1000));

    const response = await postOrderToOms(payload);
    const outcome  = extractOmsOrderOutcome(response);
    console.log("Response: ",response);

    console.log("Outcome: ",outcome);

    if (outcome.status === 'CREATED' && outcome.id) {
      await updateOrderWithOmsId(orderPkId, outcome.id);
      await setOrderErrorIntegration(orderPkId, null); // ✅ limpia errorIntegration en éxito
      console.log('📤 POST OMS OK; ref_omsOrderId y errorIntegration actualizados', {
        orderPkId, omsOrderId: outcome.id
      });
    } else if (outcome.status === 'ORDER_EXISTS') {
      // registra el error; si trae id, opcionalmente guarda ref_omsOrderId
      await setOrderErrorIntegration(orderPkId, 'ORDER_EXISTS');
      if (outcome.id) await updateOrderWithOmsId(orderPkId, outcome.id);
      console.warn('ℹ OMS: ORDER_EXISTS', { orderPkId, commerceId: orderId, id: outcome.id ?? null });
    } else {
      // Respuesta inesperada: guarda el mensaje si vino
      await setOrderErrorIntegration(orderPkId, outcome.message ?? 'UNKNOWN_RESPONSE');
      console.warn(' OMS: respuesta inesperada', {
        orderPkId, commerceId: orderId, response: getResponseData(response)
      });
    }
  } catch (e) {
    const status = e?.response?.status;
    const data   = e?.response?.data;
    const code   = normalizeOmsError(e);

    await setOrderErrorIntegration(orderPkId, code);
    console.error(' POST OMS error:', e.message, { status, data, code, orderPkId, commerceId: orderId });
  }
}

async function startCustomerOkConsumer() {
  if (!BROKERS.length) throw new Error('KAFKA_BROKER no está definido (host1:9092,host2:9092)');

  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'orders-vtex-consumer',
    brokers : BROKERS,
  });

  const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ORDERS || 'orders-ms' });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`✅ Consumer conectado y suscrito a "${TOPIC}" (brokers=${BROKERS.join(',')})`);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        await handleVtexOrderMessage(message, { topic, partition, offset: message.offset });
      } catch (e) {
        console.error('❌ Error procesando mensaje:', e.message, {
          topic, partition, offset: message.offset,
          value: message?.value?.toString?.().slice(0, 200)
        });
      }
    },
  });

  const shutdown = async (signal) => {
    console.log(`\n🛑 Recibido ${signal}, cerrando consumer...`);
    try { await consumer.disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return consumer;
}

module.exports = { startCustomerOkConsumer, handleVtexOrderMessage };

