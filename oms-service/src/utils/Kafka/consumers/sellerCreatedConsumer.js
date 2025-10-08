const kafka = require('../../../config/kafka');
const { sql, IdServicePool, IdServicePoolConnect } = require('../../../config/dbnew');
const { sendBatch } = require('../../../utils/kafkaProducer');
const { toRutPlain } = require('../../../utils/rut');

const TOPIC = process.env.SELLER_CREATED_TOPIC || 'seller.created';
const GROUP_ID = process.env.KAFKA_GROUP_ID || 'oms-service-seller-consumer';
const DLQ_TOPIC = process.env.SELLER_CREATED_DLQ_TOPIC || 'seller.created.dlq';

/** Asegura que exista el estado y devuelve su ID (crea si falta). */
async function ensureSellerStatusId(statusName, tx) {
  const find = await new sql.Request(tx)
    .input('nombre', sql.NVarChar, statusName)
    .query(`SELECT ID FROM SELLER_STATUS WHERE UPPER(NOMBRE) = UPPER(@nombre)`);
  if (find.recordset.length) return find.recordset[0].ID;

  const ins = await new sql.Request(tx)
    .input('nombre', sql.NVarChar, statusName)
    .input('desc', sql.NVarChar, 'Estado inicial del seller')
    .query(`
      INSERT INTO SELLER_STATUS (NOMBRE, DESCRIPCION, ACTIVO)
      OUTPUT INSERTED.ID
      VALUES (@nombre, @desc, 1)
    `);
  return ins.recordset[0].ID;
}

/** CREATE-ONLY por RUT plano. Si ya existe, no hace nada. */
async function createSellerIfNotExists(payload) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin();

  try {
    const statusId = await ensureSellerStatusId('Pendiente', tx);

    const rutPlain = toRutPlain(payload.rut);                 // obligatorio
    const email = (payload.correoElectronico || '').trim() || null;
    const nombre = payload.nombres || null;
    const apellido = payload.apellidos || null;
    const sapRaw = payload.externalSapId;
    const sap = sapRaw == null ? null : (String(sapRaw).trim() || null);

    // 1) ¿Existe ya por RUT? (plano + fallback formateado histórico)
    const exists = await new sql.Request(tx)
      .input('rutPlain', sql.NVarChar, rutPlain)
      .query(`
        SELECT TOP 1 ID
        FROM SELLER
        WHERE RUT = @rutPlain
           OR REPLACE(REPLACE(RUT, '.', ''), '-', '') = @rutPlain
      `);
    if (exists.recordset.length) {
      await tx.commit();
      return { created: false, reason: 'already_exists' };
    }

    // 2) INSERT (RUT SIEMPRE plano)
    await new sql.Request(tx)
      .input('sap', sql.VarChar, sap)
      .input('nombre', sql.NVarChar, nombre)
      .input('apellido', sql.NVarChar, apellido)
      .input('rut', sql.NVarChar, rutPlain)
      .input('email', sql.NVarChar, email)
      .input('statusId', sql.Int, statusId)
      .query(`
        INSERT INTO SELLER (
          EXTERNAL_SAP_ID, NOMBRE, APELLIDO, RUT, EMAIL, STATUS_ID, FECHA_CREACION
        )
        VALUES (@sap, @nombre, @apellido, @rut, @email, @statusId, GETDATE())
      `);

    await tx.commit();
    return { created: true };
  } catch (err) {
    const num = err?.number || err?.originalError?.info?.number;
    await tx.rollback();

    if (num === 2601 || num === 2627) {
      return { created: false, reason: 'unique_violation' };
    }
    throw err;
  }
}

async function startSellerCreatedConsumer() {
  const consumer = kafka.consumer({ groupId: GROUP_ID });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString();
      try {
        const payload = JSON.parse(raw || '{}');

        const rutPlain = toRutPlain(payload?.rut);
        if (!rutPlain) {
          console.warn(`[${TOPIC}] payload inválido: missing_rut`, raw);
          await sendBatch(DLQ_TOPIC, [{
            key: message.key?.toString() || null,
            value: JSON.stringify({ reason: 'missing_rut', original: raw }),
          }]).catch(() => {});
          return;
        }

        const result = await createSellerIfNotExists(payload);

        if (result.created) {
          console.log(`✅ seller creado (Pendiente)`, { rut: rutPlain, email: payload.correoElectronico || null });
        } else {
          console.log(`↩︎ seller no creado (ya existía)`, { rut: rutPlain, reason: result.reason });
        }
      } catch (err) {
        console.error(`❌ error procesando ${TOPIC}:`, err?.message || err);

        // DLQ con error + original
        try {
          await sendBatch(DLQ_TOPIC, [{
            key: message.key?.toString() || null,
            value: JSON.stringify({
              error: String(err?.message || err),
              original: raw
            }),
          }]);
        } catch (dlqErr) {
          console.error('❌ error enviando a DLQ:', dlqErr?.message || dlqErr);
        }
      }
    },
  });

  console.log(`🟢 Kafka consumer listo → topic=${TOPIC} | groupId=${GROUP_ID}`);
}

module.exports = { startSellerCreatedConsumer };
