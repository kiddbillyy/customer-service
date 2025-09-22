// // utils/kafka/consumers/CustomerOkConsumer.js
// const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');
// const { Kafka } = require('kafkajs');

// const TOPIC_CUSTOMER_OK = process.env.KAFKA_TOPIC_CUSTOMER_OK ;
// const BROKERS = (process.env.KAFKA_BROKER ).split(',');

// // normaliza booleans tipo: "ok", "true", "si", "sí", "1"
// function isOkFlag(v) {
//   if (v == null) return false;
//   const s = String(v).trim().toLowerCase();
//   return s === 'ok' || s === 'true' || s === '1' || s === 'si' || s === 'sí';
// }

// function safeJson(bufOrStr) {
//   try {
//     const s = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString('utf8') : String(bufOrStr || '');
//     return s ? JSON.parse(s) : {};
//   } catch { return {}; }
// }

// function extractErrorMessage(payload = {}, headers = {}) {
//   const h = Object.fromEntries(
//     Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v ?? '')])
//   );
//   const parts = [
//     payload.error, payload.message, payload.reason, payload.detail, payload.description,
//     h['error'], h['message'], h['reason'], h['detail'], h['description']
//   ].filter(Boolean).map(x => String(x).trim());
//   const text = parts.join(' | ');
//   return text || 'Customer integration failed (no message provided)';
// }


// async function applyCustomerOk({ orderID, cardCode }) {
//   await IdServicePoolConnect;

//   const idNum = Number(orderID);
//   if (!Number.isFinite(idNum)) throw new Error('CUSTOMER_OK_INVALID_ORDER_ID');

//   const tx = new sql.Transaction(IdServicePool);
//   try {
//     await tx.begin();


//     const cur = (await new sql.Request(tx)
//       .input('id', sql.Int, idNum)
//       .query('SELECT orderID, customerIntegrated FROM dbo.Orders WHERE orderID = @id')
//     ).recordset[0];

//     if (!cur) {
//       await tx.rollback();
//       console.warn('[customer-ok] orderID no existe:', orderID);
//       return 0;
//     }
//     if (cur.customerIntegrated === 1) {
//       await tx.commit();
//       console.log('[customer-ok] ya integrado, no-op:', orderID);
//       return 0;
//     }

//     const req = new sql.Request(tx).input('id', sql.Int, idNum);
//     const sets = [
//       'customerIntegrated = 1',
//       'customerIntegratedAt = SYSUTCDATETIME()',
//       'updateDate = SYSUTCDATETIME()'
//     ];
//     if (cardCode != null) {
//       const cc = String(cardCode).trim();
//       if (cc) {
//         req.input('cardCode', sql.NVarChar(50), cc);
//         sets.push('customerCardCode = @cardCode');
//       }
//     }

//     await req.query(`UPDATE dbo.Orders SET ${sets.join(', ')} WHERE orderID = @id;`);

//     await tx.commit();
//     return 1;
//   } catch (e) {
//     try { await tx.rollback(); } catch {}
//     throw e;
//   }
// }
// // Guarda el error recibido SIN marcar customerIntegrated
// async function applyCustomerError({ orderID, errorMessage }) {
//   await IdServicePoolConnect;

//   const idNum = Number(orderID);
//   if (!Number.isFinite(idNum)) throw new Error('CUSTOMER_ERROR_INVALID_ORDER_ID');

//   const tx = new sql.Transaction(IdServicePool);
//   try {
//     await tx.begin();

//     const req = new sql.Request(tx)
//       .input('id', sql.Int, idNum)
//       .input('err', sql.NVarChar(sql.MAX), String(errorMessage).slice(0, 4000)); // evita mega-payloads

//     // Si prefieres ACUMULAR (append) en vez de sobreescribir, reemplaza el SET de integrationError por:
//     // integrationError = CONCAT(COALESCE(integrationError, ''), CASE WHEN integrationError IS NULL OR integrationError = '' THEN '' ELSE CHAR(13)+CHAR(10) END, @err)
//     await req.query(`
//       UPDATE dbo.Orders
//       SET integrationError = @err,
//           updateDate = SYSUTCDATETIME()
//       WHERE orderID = @id;
//     `);

//     await tx.commit();
//     return 1;
//   } catch (e) {
//     try { await tx.rollback(); } catch {}
//     throw e;
//   }
// }

// async function handleCustomerOk(message) {
//   const headers = Object.fromEntries(
//     Object.entries(message.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? '')])
//   );

//   const payload  = safeJson(message.value);
//   const orderID  = payload.OrderID ?? payload.orderID ?? headers['orderid'] ?? null;
//   const okFlag   = payload.ok ?? payload.status ?? headers['ok'] ?? 'ok';
//   const cardCode = payload.CardCode ?? payload.cardCode ?? headers['cardcode'] ?? null;

//   if (orderID == null) {
//     console.warn('[customer-ok] faltó orderID, ignorado:', { payload, headers });
//     return;
//   }

//   if (!isOkFlag(okFlag)) {
//     const errMsg = extractErrorMessage(payload, headers);
//     await applyCustomerError({ orderID, errorMessage: errMsg });
//     console.warn('[customer-ok] NO-OK → guardado integrationError', { orderID, errMsg });
//     return;
//   }

//   const updated = await applyCustomerOk({ orderID, cardCode });
//   console.log(`[customer-ok] actualizado ${updated} fila(s)`, { orderID, cardCode });
// }

// async function startCustomerOkConsumer() {
//   const kafka = new Kafka({ clientId: 'orders-customer-ok', brokers: BROKERS });
//   const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ORDERS || 'orders-ms' });

//   await consumer.connect();
//   await consumer.subscribe({ topic: TOPIC_CUSTOMER_OK, fromBeginning: false });
  

//   await consumer.run({
//     eachMessage: async ({ topic, partition, message }) => {
//       try { await handleCustomerOk(message); }
//       catch (e) { console.error('Error procesando customer-ok:', e, { topic, partition, offset: message.offset }); }
//     },
//   });

//   const shutdown = async () => {
//     try { await consumer.disconnect(); } catch {}
//     process.exit(0);
//   };
//   process.on('SIGINT', shutdown);
//   process.on('SIGTERM', shutdown);

//   return consumer;
// }

// module.exports = { startCustomerOkConsumer };


// utils/kafka/consumers/CustomerOkConsumer.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');
const { Kafka } = require('kafkajs');

const TOPIC_CUSTOMER_OK = process.env.KAFKA_TOPIC_CUSTOMER_OK;
const TOPIC_FINANCE_RESERVE = process.env.KAFKA_TOPIC_FINANCE_RESERVE || 'finance.orders.reserve';
const BROKERS = (process.env.KAFKA_BROKER).split(',');

// normaliza booleans tipo: "ok", "true", "si", "sí", "1"
function isOkFlag(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'ok' || s === 'true' || s === '1' || s === 'si' || s === 'sí';
}

function safeJson(bufOrStr) {
  try {
    const s = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString('utf8') : String(bufOrStr || '');
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function extractErrorMessage(payload = {}, headers = {}) {
  const h = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v ?? '')])
  );
  const parts = [
    payload.error, payload.message, payload.reason, payload.detail, payload.description,
    h['error'], h['message'], h['reason'], h['detail'], h['description']
  ].filter(Boolean).map(x => String(x).trim());
  const text = parts.join(' | ');
  return text || 'Customer integration failed (no message provided)';
}

async function applyCustomerOk({ orderID, cardCode }) {
  await IdServicePoolConnect;

  const idNum = Number(orderID);
  if (!Number.isFinite(idNum)) throw new Error('CUSTOMER_OK_INVALID_ORDER_ID');

  const tx = new sql.Transaction(IdServicePool);
  try {
    await tx.begin();

    const cur = (await new sql.Request(tx)
      .input('id', sql.Int, idNum)
      .query('SELECT orderID, customerIntegrated FROM dbo.Orders WHERE orderID = @id')
    ).recordset[0];

    if (!cur) {
      await tx.rollback();
      console.warn('[customer-ok] orderID no existe:', orderID);
      return 0;
    }
    if (cur.customerIntegrated === 1) {
      await tx.commit();
      console.log('[customer-ok] ya integrado, no-op:', orderID);
      return 0; // igual publicaremos evento luego según estado actual
    }

    const req = new sql.Request(tx).input('id', sql.Int, idNum);
    const sets = [
      'customerIntegrated = 1',
      'customerIntegratedAt = SYSUTCDATETIME()',
      'updateDate = SYSUTCDATETIME()'
    ];
    if (cardCode != null) {
      const cc = String(cardCode).trim();
      if (cc) {
        req.input('cardCode', sql.NVarChar(50), cc);
        sets.push('customerCardCode = @cardCode');
      }
    }

    await req.query(`UPDATE dbo.Orders SET ${sets.join(', ')} WHERE orderID = @id;`);

    await tx.commit();
    return 1;
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}

// Guarda el error recibido SIN marcar customerIntegrated
async function applyCustomerError({ orderID, errorMessage }) {
  await IdServicePoolConnect;

  const idNum = Number(orderID);
  if (!Number.isFinite(idNum)) throw new Error('CUSTOMER_ERROR_INVALID_ORDER_ID');

  const tx = new sql.Transaction(IdServicePool);
  try {
    await tx.begin();

    const req = new sql.Request(tx)
      .input('id', sql.Int, idNum)
      .input('err', sql.NVarChar(sql.MAX), String(errorMessage).slice(0, 4000)); // evita mega-payloads

    // Si prefieres ACUMULAR (append), reemplaza SET por concatenación.
    await req.query(`
      UPDATE dbo.Orders
      SET integrationError = @err,
          updateDate = SYSUTCDATETIME()
      WHERE orderID = @id;
    `);

    await tx.commit();
    return 1;
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}

// Lee el estado actual para obtener U_REF1 y si quedó integrado
async function fetchOrderIntegration(orderID) {
  await IdServicePoolConnect;
  const idNum = Number(orderID);
  if (!Number.isFinite(idNum)) throw new Error('FETCH_STATE_INVALID_ORDER_ID');

  const row = (await new sql.Request(IdServicePool)
    .input('id', sql.Int, idNum)
    .query(`
      SELECT orderID, customerIntegrated, customerCardCode, U_REF1
      FROM dbo.Orders WHERE orderID = @id
    `)
  ).recordset[0];

  return row || null;
}

async function handleCustomerOk(message, producer) {
  const headers = Object.fromEntries(
    Object.entries(message.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? '')])
  );

  const payload  = safeJson(message.value);
  const orderID  = payload.OrderID ?? payload.orderID ?? headers['orderid'] ?? null;
  const okFlag   = payload.ok ?? payload.status ?? headers['ok'] ?? 'ok';
  const cardCode = payload.CardCode ?? payload.cardCode ?? headers['cardcode'] ?? null;

  if (orderID == null) {
    console.warn('[customer-ok] faltó orderID, ignorado:', { payload, headers });
    return;
  }

  if (!isOkFlag(okFlag)) {
    const errMsg = extractErrorMessage(payload, headers);
    await applyCustomerError({ orderID, errorMessage: errMsg });
    console.warn('[customer-ok] NO-OK → guardado integrationError', { orderID, errMsg });
    return;
  }

  const updated = await applyCustomerOk({ orderID, cardCode });
  console.log(`[customer-ok] actualizado ${updated} fila(s)`, { orderID, cardCode });


  const st = await fetchOrderIntegration(orderID);
  const uref1 = st?.U_REF1 || String(orderID); 

  if (st?.customerIntegrated == 1) {
    await producer.send({
      topic: TOPIC_FINANCE_RESERVE,
      messages: [{
        key: uref1,                            
        value: JSON.stringify({ u_ref1: uref1 })
      }]
    });
    console.log('[customer-ok] → finance.orders.reserve publicado', { orderID, uref1 });
  } else {
    console.log('[customer-ok] no se publica a finanzas (faltan condiciones)', {
      orderID,
      integrated: st?.customerIntegrated
    });
  }
}

async function startCustomerOkConsumer() {
  const kafka = new Kafka({ clientId: 'orders-customer-ok', brokers: BROKERS });
  const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ORDERS || 'orders-ms' });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: TOPIC_CUSTOMER_OK, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try { await handleCustomerOk(message, producer); }
      catch (e) {
        console.error('Error procesando customer-ok:', e, { topic, partition, offset: message.offset });
      }
    },
  });

  const shutdown = async () => {
    try { await consumer.disconnect(); } catch {}
    try { await producer.disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { consumer, producer };
}

module.exports = { startCustomerOkConsumer };
