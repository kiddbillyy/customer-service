// src/consumers/sellerValidationSapConsumer.js
const kafka = require('../../../config/kafka');
const { sql, IdServicePool, IdServicePoolConnect } = require('../../../config/dbnew');
const { toRutPlain } = require('../../../utils/rut');
const { sendBatch } = require('../../../utils/kafkaProducer');
const { login, logout, get: sapGet } = require('../../../infra/sapClient');

const TOPIC = process.env.SELLER_VALIDATION_SAP_TOPIC || 'seller-validation-sap';
const RESULT_TOPIC = process.env.SELLER_VALIDATION_SAP_RESULT_TOPIC || 'seller-validation-sap.result';
const GROUP_ID = process.env.KAFKA_GROUP_ID_SAP || 'oms-service-sap-sync';
const DLQ_TOPIC = process.env.SELLER_VALIDATION_SAP_DLQ || 'seller-validation-sap.dlq';

// -- DB helpers --
async function ensureStatusId(statusName, tx) {
  const find = await new sql.Request(tx)
    .input('nombre', sql.NVarChar, statusName)
    .query(`SELECT ID FROM SELLER_STATUS WHERE UPPER(NOMBRE) = UPPER(@nombre)`);
  if (find.recordset.length) return find.recordset[0].ID;

  // 👇 Esto NO crea en SAP, solo asegura que el estado exista en tu tabla de estados.
// (Lo mantenemos para no romper por FK si “Activo” aún no está configurado)
  const ins = await new sql.Request(tx)
    .input('nombre', sql.NVarChar, statusName)
    .input('desc', sql.NVarChar, `Estado ${statusName}`)
    .query(`
      INSERT INTO SELLER_STATUS (NOMBRE, DESCRIPCION, ACTIVO)
      OUTPUT INSERTED.ID
      VALUES (@nombre, @desc, 1)
    `);
  return ins.recordset[0].ID;
}

async function setSellerSapIdAndStatus({ sellerId, externalSapId, newStatusName }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin();
  try {
    const statusId = await ensureStatusId(newStatusName, tx);
    await new sql.Request(tx)
      .input('sellerId', sql.Int, sellerId)
      .input('externalSapId', sql.VarChar, externalSapId)
      .input('statusId', sql.Int, statusId)
      .query(`
        UPDATE SELLER
        SET EXTERNAL_SAP_ID = @externalSapId,
            STATUS_ID       = @statusId,
            FECHA_ACTUALIZACION = GETDATE()
        WHERE ID = @sellerId
      `);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// -- SAP helper (solo GET) --
async function fetchSalespersonByRutPlain(rutPlain, cookie) {
  const filter = encodeURIComponent(`U_RUT eq '${rutPlain}'`);
  const data = await sapGet(`/SalesPersons?$filter=${filter}`, cookie);

  const row = data?.value?.[0];
  const sapId =
    row?.SalesPersonCode ??
    row?.SalesPersonID ??
    row?.Code ??
    row?.Id ??
    null;

  return sapId ? String(sapId) : null;
}

// -- Consumer --
async function startSellerValidationSapConsumer() {
  const consumer = kafka.consumer({ groupId: GROUP_ID });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString();
      try {
        const evt = JSON.parse(raw || '{}');
        const seller = evt?.seller || {};
        const sellerId = seller?.id ?? null;
        const rutPlain = toRutPlain(seller?.rut);

        if (!sellerId || !rutPlain) {
          console.warn(`[${TOPIC}] payload inválido`, { sellerId, rut: seller?.rut, raw });
          await sendBatch(DLQ_TOPIC, [{
            key: message.key?.toString() || null,
            value: JSON.stringify({ reason: 'invalid_payload', original: raw }),
          }]).catch(() => {});
          return;
        }

        // Login SAP
        const { cookie } = await login();

        // GET por RUT (solo lectura)
        const sapSalesperson = await fetchSalespersonByRutPlain(rutPlain, cookie);

        // Logout (best effort)
        try { await logout(cookie); } catch {}

        if (!sapSalesperson) {
          console.log(`ℹ️ No existe salesperson SAP para RUT`, { rutPlain, sellerId });
          if (RESULT_TOPIC) {
            await sendBatch(RESULT_TOPIC, [{
              key: String(sellerId),
              value: JSON.stringify({
                event: 'seller.validation.result',
                version: 1,
                status: 'NOT_FOUND',
                sellerId,
                rut: rutPlain,
                ts: new Date().toISOString()
              }),
            }]).catch(() => {});
          }
          return;
        }

        // Si existe en SAP → actualiza EXTERNAL_SAP_ID y estado a “Activo”
        await setSellerSapIdAndStatus({
          sellerId,
          externalSapId: sapSalesperson,
          newStatusName: 'Activo',
        });

        console.log(`✅ Seller validado (GET) con SAP`, { sellerId, rutPlain, sapSalesperson });

        if (RESULT_TOPIC) {
          await sendBatch(RESULT_TOPIC, [{
            key: String(sellerId),
            value: JSON.stringify({
              event: 'seller.validation.result',
              version: 1,
              status: 'FOUND',
              sellerId,
              rut: rutPlain,
              externalSapId: sapSalesperson,
              ts: new Date().toISOString()
            }),
          }]).catch(() => {});
        }
      } catch (err) {
        console.error(`❌ error procesando ${TOPIC}:`, err?.message || err);
        try {
          await sendBatch(DLQ_TOPIC, [{
            key: message.key?.toString() || null,
            value: JSON.stringify({ error: String(err?.message || err), original: raw }),
          }]);
        } catch (dlqErr) {
          console.error('❌ error enviando a DLQ:', dlqErr?.message || dlqErr);
        }
      }
    },
  });

  console.log(`🟢 Consumer listo → topic=${TOPIC} | groupId=${GROUP_ID}`);
}

module.exports = { startSellerValidationSapConsumer };
