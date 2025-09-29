const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');
const { Kafka } = require('kafkajs');

// ---- Config ----
const TOPIC_FINANCE_OK = process.env.KAFKA_TOPIC_FINANCE_OK || 'finance.reservation.created';
const BROKERS = (process.env.KAFKA_BROKER || 'localhost:9092').split(',').map(s => s.trim());
const GROUP_ID = process.env.KAFKA_GROUP_FINANCE_OK || 'oms-finance-ok-consumer';

// OMS API (para marcar estado "Factura de Reserva")
const OMS_API_BASE = process.env.OMS_API_BASE || 'http://localhost:5010';
const OMS_ORDERS_PATH = process.env.OMS_ORDERS_PATH || '/api/oms-service/orders';
const OMS_API_TOKEN = process.env.OMS_API_TOKEN || ''; // opcional: bearer
const OMS_FINANCE_RESERVED_STATUS_CODE = process.env.OMS_FINANCE_RESERVED_STATUS_CODE || 'FACTURA RESERVA CREADA';

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

// ---- DB apply + obtener orderId ----
async function applyFinanceInvoiceToOrder({ u_ref1, invoiceDocEntry, invoiceDocNum, invoiceFolioNum }) {
  await IdServicePoolConnect;

  const tx = new sql.Transaction(IdServicePool);
  try {
    await tx.begin();

    // 1) Verifica existencia y obtiene orderID por u_ref1
    const cur = (await new sql.Request(tx)
      .input('uref1', sql.NVarChar(100), String(u_ref1))
      .query(`
        SELECT TOP 1 orderID, u_ref1
        FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
        WHERE u_ref1 = @uref1
      `)
    ).recordset[0];

    if (!cur) {
      await tx.rollback();
      console.warn('[finance-ok] no existe order con u_ref1:', u_ref1);
      return { updated: 0, orderId: null };
    }

    const orderId = Number(cur.orderID);

    // 2) Actualiza columnas de invoice
    const req = new sql.Request(tx)
      .input('uref1', sql.NVarChar(100), String(u_ref1))
      .input('docEntry', sql.Int, Number(invoiceDocEntry));

    const sets = [
      'DocentryInvoice = @docEntry',
      'updateDate = SYSUTCDATETIME()'
    ];

    if (invoiceDocNum != null) {
      req.input('docNum', sql.Int, Number(invoiceDocNum));
      sets.push('InvoiceDocNum = @docNum');
    }

    if (invoiceFolioNum != null) {
      req.input('folio', sql.Int, Number(invoiceFolioNum));
      // Ajusta el nombre real de la columna de folio si difiere
      sets.push('[FolioNum] = @folio');
    }

    await req.query(`UPDATE dbo.Orders SET ${sets.join(', ')} WHERE u_ref1 = @uref1;`);

    await tx.commit();
    return { updated: 1, orderId };
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}

// ---- Llamada a OMS para cambiar estado ----
async function propagateOmsStatus({ orderId, statusCode }) {
  if (!orderId) {
    console.warn('[finance-ok] propagateOmsStatus: orderId faltante');
    return { ok: false, status: 0, body: null };
  }

  const url = `${OMS_API_BASE}${OMS_ORDERS_PATH}/${orderId}`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (OMS_API_TOKEN) headers['Authorization'] = `Bearer ${OMS_API_TOKEN}`;

  const body = JSON.stringify({ orderStatusCode: String(statusCode) });

  const res = await doFetch(url, {
    method: 'PATCH', // o 'PUT' si tu API lo requiere; según tu mensaje es PATCH
    headers,
    body,
  });

  const text = await res.text().catch(() => '');
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

  if (!res.ok) {
    console.error(`[finance-ok] OMS status PATCH fallo (${res.status}) orderId=${orderId}:`, parsed || text);
    return { ok: false, status: res.status, body: parsed };
  }

  console.log(`[finance-ok] OMS status PATCH OK orderId=${orderId}, code="${statusCode}"`);
  return { ok: true, status: res.status, body: parsed };
}

// ---- Handler de mensajes ----
async function handleFinanceOk(message) {
  const payload = safeJson(message.value);

  const u_ref1 = payload.u_ref1 ?? payload.U_REF1 ?? null;
  const invoiceDocEntry  = payload.invoiceDocEntry;
  const invoiceDocNum    = payload.invoiceDocNum ?? null;
  const invoiceFolioNum  = payload.invoiceFolioNum ?? null;

  if (!u_ref1) {
    console.warn('[finance-ok] faltó u_ref1, mensaje ignorado:', payload);
    return;
  }
  if (invoiceDocEntry == null) {
    console.warn('[finance-ok] faltó invoiceDocEntry, mensaje ignorado:', { u_ref1, payload });
    return;
  }

  // 1) Aplica datos de la factura de reserva en Orders y obtiene orderId
  const { updated, orderId } = await applyFinanceInvoiceToOrder({ u_ref1, invoiceDocEntry, invoiceDocNum, invoiceFolioNum });
  console.log(`[finance-ok] u_ref1=${u_ref1} aplicado a Orders (filas=${updated})`, {
    invoiceDocEntry, invoiceDocNum, invoiceFolioNum, orderId
  });

  // 2) Marca estado "FACTURA RESERVA CREADA" en OMS (PATCH /orders/:orderId)
  //    Solo si hubo actualización y tenemos orderId
  if (updated === 1 && orderId) {
    try {
      await propagateOmsStatus({
        orderId,
        statusCode: OMS_FINANCE_RESERVED_STATUS_CODE, // "FACTURA RESERVA CREADA" por defecto
      });
    } catch (e) {
      console.error('[finance-ok] Error al propagar estado a OMS:', e.message, { orderId, u_ref1 });
    }
  } else {
    console.warn('[finance-ok] No se propaga estado a OMS (sin update o sin orderId)', { u_ref1, orderId, updated });
  }
}



// ---- Runner ----
async function startFinanceReservationCreatedConsumer() {
  const kafka = new Kafka({ clientId: 'oms-finance-ok', brokers: BROKERS });
  const consumer = kafka.consumer({ groupId: GROUP_ID });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_FINANCE_OK, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        await handleFinanceOk(message);
      } catch (e) {
        console.error('Error procesando finance.reservation.created:', e, {
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

module.exports = { startFinanceReservationCreatedConsumer };



