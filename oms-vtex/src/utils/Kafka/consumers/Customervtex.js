// utils/kafka/consumers/CustomerOkConsumer.js
const { Kafka } = require('kafkajs');
const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');
const { fetchVtexOrder } = require('../../../service/vtexService');
const { buildOmsPayload } = require('../../../services/omsMapper');
const { postOrderToOms } = require('../../../services/omsService')

const TOPIC   = process.env.KAFKA_TOPIC_ORDER_STATUS || 'vtex.order.integration';
const BROKERS = (process.env.KAFKA_BROKER || '').split(',').filter(Boolean);

// ---------- helpers ----------
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

  // status puede venir o no; si no viene, usamos state
  let status =
    payload.status ?? payload.Status ?? payload.STATUS ??
    headers['status'] ?? headers['x-status'] ?? null;

  // 🔧 fallback: si no hay state pero sí status, úsalo como state
  if (!state && status) state = status;
  if (!status && state) status = state;

  if (!orderId || typeof orderId !== 'string') throw new Error('VTEX_MSG_INVALID_ORDERID');
  if (!state  || typeof state  !== 'string')   throw new Error('VTEX_MSG_INVALID_STATE');

  return { orderId, state, status, payload, headers };
}
async function persistOrderAndStatus({ commerceId, creationDateIso, state, status }) {
  await IdServicePoolConnect;

  const tx = new sql.Transaction(IdServicePool);
  await tx.begin();
  try {
    // 1) Buscar si ya existe por commerceId (con lock para evitar carreras)
    const findReq = new sql.Request(tx)
      .input('commerceId', sql.NVarChar(100), commerceId);

    const cur = (await findReq.query(`
      SELECT id, creationDate
      FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
      WHERE commerceId = @commerceId;
    `)).recordset[0];

    if (cur) {
      // 👉 Ya existe: NO hacemos nada más
      console.log('🚫 orders skip (ya existe):', { commerceId, id: cur.id });
      await tx.commit();
      return Number(cur.id);
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
    return orderPkId;
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error('❌ persistOrderAndStatus error:', e.message)
    throw e;
  }
}

// ---------- consumer ----------
async function handleVtexOrderMessage(message, ctx) {
  const { topic, partition, offset } = ctx;
  const { orderId, state, status } = parseOrderMessage(message);

  console.log(`📥 [${topic}|p${partition}|o${offset}] orderId=${orderId}, state=${state}, status=${status}`);

  // Obtener creationDate desde VTEX (no bloquea si falla)
  let creationDateIso = null;
  try {
    const vtexData = await fetchVtexOrder(orderId);
    creationDateIso = vtexData?.creationDate || null;
  } catch (e) {
    console.warn(`⚠️ VTEX fetch fallo para ${orderId}: ${e.message}`);
  }

  await persistOrderAndStatus({
    commerceId: orderId,
    creationDateIso,
    state,
    status
  });
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

// utils/kafka/consumers/Customervtex.js

// utils/kafka/consumers/CustomerOkConsumer.js
// const { Kafka } = require('kafkajs');
// const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');
// const { fetchVtexOrder } = require('../../../service/vtexService');

// // 🔹 NUEVO: mapper + service OMS
// const { buildOmsPayload } = require('../../../services/omsMapper');
// const { postOrderToOms }  = require('../../../services/omsService');

// const TOPIC   = process.env.KAFKA_TOPIC_ORDER_STATUS || 'vtex.order.integration';
// const BROKERS = (process.env.KAFKA_BROKER || '').split(',').filter(Boolean);

// // ---------- helpers ----------
// function safeJson(bufOrStr) {
//   try {
//     const s = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString('utf8') : String(bufOrStr || '');
//     return s ? JSON.parse(s) : {};
//   } catch { return {}; }
// }

// function parseOrderMessage(message) {
//   const headers = Object.fromEntries(
//     Object.entries(message.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? '')])
//   );
//   const payload = safeJson(message.value);

//   const orderId =
//     payload.orderId ?? payload.OrderId ?? payload.ORDERID ??
//     payload.orderID ?? headers['orderid'] ?? headers['x-orderid'] ?? null;

//   let state =
//     payload.state ?? payload.State ?? payload.STATE ??
//     headers['state'] ?? headers['x-state'] ?? null;

//   // status puede venir o no; si no viene, usamos state
//   let status =
//     payload.status ?? payload.Status ?? payload.STATUS ??
//     headers['status'] ?? headers['x-status'] ?? null;

//   // fallback entre state/status
//   if (!state && status) state = status;
//   if (!status && state) status = state;

//   if (!orderId || typeof orderId !== 'string') throw new Error('VTEX_MSG_INVALID_ORDERID');
//   if (!state  || typeof state  !== 'string')   throw new Error('VTEX_MSG_INVALID_STATE');

//   return { orderId, state, status, payload, headers };
// }

// // ---------- persistencia ----------
// async function persistOrderAndStatus({ commerceId, creationDateIso, state, status }) {
//   await IdServicePoolConnect;

//   const tx = new sql.Transaction(IdServicePool);
//   await tx.begin();
//   try {
//     // 1) Buscar si ya existe por commerceId (con lock para evitar carreras)
//     const findReq = new sql.Request(tx)
//       .input('commerceId', sql.NVarChar(100), commerceId);

//     const cur = (await findReq.query(`
//       SELECT id, creationDate
//       FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
//       WHERE commerceId = @commerceId;
//     `)).recordset[0];

//     if (cur) {
//       // 👉 Ya existe: NO hacemos nada más
//       console.log('🚫 orders skip (ya existe):', { commerceId, id: cur.id });
//       await tx.commit();
//       // 🔹 NUEVO: devolvemos flag created=false para decidir el POST
//       return { orderPkId: Number(cur.id), created: false };
//     }

//     // 2) Insertar nueva orden (primera vez)
//     const creationDate = creationDateIso ? new Date(creationDateIso) : null;

//     const insReq = new sql.Request(tx)
//       .input('commerceId',        sql.NVarChar(100), commerceId)
//       .input('ref_salesChannel',  sql.NVarChar(100), 'VTE-001')
//       .input('ref_accountId',     sql.NVarChar(100), 'VTE-97c2f7cb0cd04c72b6a344a3cd12c1ec')
//       .input('creationDate',      sql.DateTime2(3),  creationDate)
//       .input('source',            sql.NVarChar(50),  'VTEX');

//     const inserted = await insReq.query(`
//       INSERT INTO dbo.Orders (commerceId, ref_salesChannelId, ref_accountId, creationDate, source, insertedAt, updatedAt)
//       VALUES (@commerceId, @ref_salesChannel, @ref_accountId, @creationDate, @source, SYSUTCDATETIME(), NULL);
//       SELECT SCOPE_IDENTITY() AS id;
//     `);

//     const orderPkId = Number(inserted.recordset[0].id);
//     console.log('🆕 Orders insert id=', orderPkId, 'commerceId=', commerceId);

//     // 3) Registrar el primer estado SOLO en la creación inicial
//     const src     = 'VTEX';
//     const _state  = String(state).slice(0, 40);
//     const _status = String(status ?? state).slice(0, 20);

//     const oscReq = new sql.Request(tx)
//       .input('orderId', sql.Int,          orderPkId)
//       .input('source',  sql.NVarChar(30), src)
//       .input('state',   sql.NVarChar(40), _state)
//       .input('status',  sql.NVarChar(20), _status);

//     await oscReq.query(`
//       INSERT INTO dbo.OrderStatusChange (orderId, source, state, status, dateCreated, dateModified)
//       VALUES (@orderId, @source, @state, @status, SYSUTCDATETIME(), NULL);
//     `);

//     await tx.commit();
//     console.log('✅ OrderStatusChange insert (inicial) ok → orderId=', orderPkId);
//     // 🔹 NUEVO: devolvemos flag created=true
//     return { orderPkId, created: true };
//   } catch (e) {
//     try { await tx.rollback(); } catch {}
//     console.error('❌ persistOrderAndStatus error:', e.message);
//     throw e;
//   }
// }

// // ---------- consumer ----------
// async function handleVtexOrderMessage(message, ctx) {
//   const { topic, partition, offset } = ctx;
//   const { orderId, state, status } = parseOrderMessage(message);

//   console.log(`📥 [${topic}|p${partition}|o${offset}] orderId=${orderId}, state=${state}, status=${status}`);

//   // Obtener creationDate desde VTEX (no bloquea si falla)
//   let vtexData = null;
//   try {
//     vtexData = await fetchVtexOrder(orderId);
//   } catch (e) {
//     console.warn(`⚠️ VTEX fetch fallo para ${orderId}: ${e.message}`);
//   }

//   // Persistir (solo crea si no existe)
//   const { orderPkId, created } = await persistOrderAndStatus({
//     commerceId: orderId,
//     creationDateIso: vtexData?.creationDate || null,
//     state,
//     status
//   });

//   // 🔹 NUEVO: POST al OMS SOLO la primera vez y si hay detalle VTEX
//   if (!created) {
//     console.log('↩️  OMS POST omitido (orden ya existente)', { orderPkId, commerceId: orderId });
//     return;
//   }
//   if (!vtexData) {
//     console.warn('⚠️ OMS POST omitido: no hay detalle VTEX', { orderPkId, commerceId: orderId });
//     return;
//   }

//   try {
//     const payload = buildOmsPayload(vtexData, { orderId, state, status });
//     const rsp = await postOrderToOms(payload);
//     console.log('📤 POST OMS OK', { orderPkId, commerceId: orderId, rsp });
//   } catch (e) {
//     console.error('❌ POST OMS error:', e.message, { orderPkId, commerceId: orderId });
//   }
// }

// async function startCustomerOkConsumer() {
//   if (!BROKERS.length) throw new Error('KAFKA_BROKER no está definido (host1:9092,host2:9092)');

//   const kafka = new Kafka({
//     clientId: process.env.KAFKA_CLIENT_ID || 'orders-vtex-consumer',
//     brokers : BROKERS,
//   });

//   const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ORDERS || 'orders-ms' });

//   await consumer.connect();
//   await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
//   console.log(`✅ Consumer conectado y suscrito a "${TOPIC}" (brokers=${BROKERS.join(',')})`);

//   await consumer.run({
//     eachMessage: async ({ topic, partition, message }) => {
//       try {
//         await handleVtexOrderMessage(message, { topic, partition, offset: message.offset });
//       } catch (e) {
//         console.error('❌ Error procesando mensaje:', e.message, {
//           topic, partition, offset: message.offset,
//           value: message?.value?.toString?.().slice(0, 200)
//         });
//       }
//     },
//   });

//   const shutdown = async (signal) => {
//     console.log(`\n🛑 Recibido ${signal}, cerrando consumer...`);
//     try { await consumer.disconnect(); } catch {}
//     process.exit(0);
//   };
//   process.on('SIGINT',  () => shutdown('SIGINT'));
//   process.on('SIGTERM', () => shutdown('SIGTERM'));

//   return consumer;
// }

// module.exports = { startCustomerOkConsumer, handleVtexOrderMessage };


// kafka-console-producer.sh