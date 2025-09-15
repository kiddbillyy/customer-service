// utils/kafka/consumers/VtexStatusConsumer.js
const { Kafka } = require('kafkajs');
const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');

const { propagateToVtexIfNeeded } = require('../../../services/vtexStatusRouter');

const TOPIC   = process.env.KAFKA_TOPIC_VTEX_STATUS || 'vtex.status';
const BROKERS = (process.env.KAFKA_BROKER || '').split(',').filter(Boolean);
const GROUP   = process.env.KAFKA_GROUP_VTEX_STATUS || 'oms-vtex-status';

// ---------- helpers ----------
function safeJson(bufOrStr) {
  try {
    const s = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString('utf8') : String(bufOrStr || '');
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function parseStatusMessage(message) {
  const headers = Object.fromEntries(
    Object.entries(message.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? '')])
  );
  const payload = safeJson(message.value);

  // commerceId (alias orderId)
  const commerceId =
    payload.commerceId ?? payload.COMMERCEID ??
    payload.orderId    ?? payload.OrderId ?? payload.ORDERID ??
    headers['commerceid'] ?? headers['orderid'] ?? null;

  // estado (acepta state/status)
  let state =
    payload.state ?? payload.State ?? payload.STATE ??
    payload.status ?? payload.Status ?? payload.STATUS ??
    headers['state'] ?? headers['status'] ?? null;

  // fuente (por defecto finance)
  let source =
    payload.source ?? payload.Source ?? payload.SOURCE ??
    headers['source'] ?? 'finance';

  // clave única de evento (trazabilidad / potencial idempotencia futura)
  const eventId =
    payload.eventId ?? payload.EventId ?? payload.EVENTID ??
    headers['x-event-id'] ?? headers['eventid'] ?? null;

  if (!commerceId || typeof commerceId !== 'string') {
    throw new Error('STATUS_MSG_INVALID_COMMERCEID');
  }
  if (!state || typeof state !== 'string') {
    throw new Error('STATUS_MSG_INVALID_STATE');
  }

  // normaliza tamaños a NVARCHAR de tu esquema (source 30, state 40, status 20)
  return {
    commerceId: String(commerceId).trim(),
    state : String(state).trim().slice(0, 40),
    status: String(state).trim().slice(0, 20), // si decides usar status en paralelo
    source: String(source).trim().slice(0, 30),
    eventId: eventId ? String(eventId).trim() : null,
    headers, payload,
  };
}

// Inserta el cambio de estado resolviendo orderId desde Orders por commerceId
async function insertOrderStatusChange({ commerceId, state, status, source, eventId }) {
  await IdServicePoolConnect;

  const tx = new sql.Transaction(IdServicePool);
  await tx.begin();
  try {
    // 1) obtener PK en Orders por commerceId
    const row = (await new sql.Request(tx)
      .input('commerceId', sql.NVarChar(200), commerceId)
      .query(`
        SELECT id
        FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
        WHERE commerceId = @commerceId;
      `)
    ).recordset[0];

    if (!row) {
      await tx.rollback();
      console.warn('⚠️ VtexStatusConsumer: ORDER_NOT_FOUND', { commerceId, state, source, eventId });
      return { inserted: 0, reason: 'ORDER_NOT_FOUND' };
    }
    const orderId = Number(row.id);

    // 2) anti-duplicado: compara con el último estado registrado para la orden
    const last = (await new sql.Request(tx)
      .input('orderId', sql.Int, orderId)
      .query(`
        SELECT TOP (1) state, status
        FROM dbo.OrderStatusChange WITH (READPAST)
        WHERE orderId = @orderId
        ORDER BY id DESC
      `)
    ).recordset[0];

    if (last && (String(last.state) === state && String(last.status) === status)) {
      // aun así reflejamos "lastChange" para trazar que llegó un evento repetido
      await new sql.Request(tx)
        .input('orderId', sql.Int, orderId)
        .query(`
          UPDATE dbo.Orders
             SET updatedAt  = SYSUTCDATETIME()
           WHERE id = @orderId;
        `);

      await tx.commit();
      console.log('↩️ status-skip (igual al último)', { orderId, commerceId, state, source, eventId });
      return { inserted: 0, reason: 'DUPLICATE_LAST_STATE', orderId };
    }

    // 3) insertar en OrderStatusChange
    await new sql.Request(tx)
      .input('orderId', sql.Int,          orderId)
      .input('source',  sql.NVarChar(30), source )
      .input('state',   sql.NVarChar(40), state)
      .input('status',  sql.NVarChar(20), status)
      .query(`
        INSERT INTO dbo.OrderStatusChange (orderId, source, state, status, dateCreated, dateModified)
        VALUES (@orderId, @source, @state, @status, SYSUTCDATETIME(), NULL);
      `);

    await tx.commit();
    console.log('✅ status-insert OK', { orderId, commerceId, state, source, eventId });
    return { inserted: 1, orderId };
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error('❌ VtexStatusConsumer insert error:', e.message, { commerceId, state, source, eventId });
    throw e;
  }
}

// // ---------- handler ----------
// async function handleVtexStatusMessage(message, ctx) {
//   const { topic, partition, offset } = ctx;
//   const { commerceId, state, status, source, eventId } = parseStatusMessage(message);

//   console.log(`📥 [${topic}|p${partition}|o${offset}] commerceId=${commerceId}, state=${state}, source=${source}, eventId=${eventId || '—'}`);

//   await insertOrderStatusChange({
//     commerceId,
//     state,
//     status,
//     source,
//     eventId
//   });
// }

async function handleVtexStatusMessage(message, ctx) {
  const { topic, partition, offset } = ctx;
  const { commerceId, state, status, source, eventId, payload } = parseStatusMessage(message);

  console.log(`📥 [${topic}|p${partition}|o${offset}] commerceId=${commerceId}, state=${state}, source=${source}, eventId=${eventId || '—'}`);

  const res = await insertOrderStatusChange({ commerceId, state, status, source, eventId });

  if (res?.inserted === 1) {

    const allowedSources =
      (process.env.VTEX_STATUS_ALLOWED_SOURCES || 'finance,oms-finances')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

    const src = String(source || '').trim().toLowerCase();
    if (!allowedSources.includes(src)) {
      console.log(`↷ no se propaga a VTEX por source="${source}" (permitidos: ${allowedSources.join(', ')})`);
      return;
    }

    try {
      await propagateToVtexIfNeeded({ commerceId, state, payload });
    } catch (e) {
      console.error('❌ propagateToVtexIfNeeded error', {
        topic, partition, offset, commerceId, state, source, eventId, err: e.message,
      });
    }
  } else {
    console.log(`↩️ no se propagó a VTEX (inserted=${res?.inserted}, reason=${res?.reason || '—'})`);
  }
}

// ---------- runner ----------
async function startVtexStatusConsumer() {
  if (!BROKERS.length) throw new Error('KAFKA_BROKER no está definido (host1:9092,host2:9092)');

  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID,
    brokers : BROKERS,
  });

  const consumer = kafka.consumer({ groupId: GROUP });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`✅ VtexStatusConsumer suscrito a "${TOPIC}" (brokers=${BROKERS.join(',')}, group=${GROUP})`);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        await handleVtexStatusMessage(message, { topic, partition, offset: message.offset });
      } catch (e) {
        console.error('❌ Error procesando vtex.status:', e.message, {
          topic, partition, offset: message.offset,
          key: message?.key?.toString?.(),
          value: message?.value?.toString?.().slice(0, 300),
        });
      }
    },
  });

  const shutdown = async (signal) => {
    console.log(`\n Recibido ${signal}, cerrando VtexStatusConsumer...`);
    try { await consumer.disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return consumer;
}

module.exports = { startVtexStatusConsumer, handleVtexStatusMessage };
