// utils/kafka/consumers/FinanceReservationCreatedConsumer.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../../../config/dbnew');
const { Kafka } = require('kafkajs');

const TOPIC_FINANCE_OK = process.env.KAFKA_TOPIC_FINANCE_OK || 'finance.reservation.created';
const BROKERS = (process.env.KAFKA_BROKER || 'localhost:9092').split(',').map(s => s.trim());
const GROUP_ID = process.env.KAFKA_GROUP_FINANCE_OK || 'oms-finance-ok-consumer';

// Parse seguro de JSON
function safeJson(bufOrStr) {
  try {
    const s = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString('utf8') : String(bufOrStr || '');
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

async function applyFinanceInvoiceToOrder({ u_ref1, invoiceDocEntry, invoiceDocNum, invoiceFolioNum }) {
  await IdServicePoolConnect;

  const tx = new sql.Transaction(IdServicePool);
  try {
    await tx.begin();

    // Verifica existencia de la orden por u_ref1
    const cur = (await new sql.Request(tx)
      .input('uref1', sql.NVarChar(100), String(u_ref1))
      .query(`SELECT TOP 1 orderID, u_ref1 FROM dbo.Orders WHERE u_ref1 = @uref1`)
    ).recordset[0];

    if (!cur) {
      await tx.rollback();
      console.warn('[finance-ok] no existe order con u_ref1:', u_ref1);
      return 0;
    }

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
      // Usa el nombre real de tu columna de folio. Aquí asumimos "FolioNum".
      sets.push('[FolioNum] = @folio');
    }

    await req.query(`UPDATE dbo.Orders SET ${sets.join(', ')} WHERE u_ref1 = @uref1;`);

    await tx.commit();
    return 1;
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}

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

  const updated = await applyFinanceInvoiceToOrder({ u_ref1, invoiceDocEntry, invoiceDocNum, invoiceFolioNum });
  console.log(`[finance-ok] u_ref1=${u_ref1} aplicado a Orders (filas=${updated})`, {
    invoiceDocEntry, invoiceDocNum, invoiceFolioNum
  });
}

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
