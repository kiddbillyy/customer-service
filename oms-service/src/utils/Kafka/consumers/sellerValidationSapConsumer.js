// // src/consumers/sellerValidationSapConsumer.js
// const kafka = require('../../../config/kafka');
// const { sql, IdServicePool, IdServicePoolConnect } = require('../../../config/dbnew');
// const { toRutPlain } = require('../../../utils/rut');
// const { sendBatch } = require('../../../utils/kafkaProducer');
// const { login, logout, get: sapGet } = require('../../../infra/sapClient');

// const TOPIC = process.env.SELLER_VALIDATION_SAP_TOPIC || 'seller-validation-sap';
// const RESULT_TOPIC = process.env.SELLER_VALIDATION_SAP_RESULT_TOPIC || 'seller-validation-sap.result';
// const GROUP_ID = process.env.KAFKA_GROUP_ID_SAP || 'oms-service-sap-sync';
// const DLQ_TOPIC = process.env.SELLER_VALIDATION_SAP_DLQ || 'seller-validation-sap.dlq';

// // -- DB helpers --
// async function ensureStatusId(statusName, tx) {
//   const find = await new sql.Request(tx)
//     .input('nombre', sql.NVarChar, statusName)
//     .query(`SELECT ID FROM SELLER_STATUS WHERE UPPER(NOMBRE) = UPPER(@nombre)`);
//   if (find.recordset.length) return find.recordset[0].ID;

//   const ins = await new sql.Request(tx)
//     .input('nombre', sql.NVarChar, statusName)
//     .input('desc', sql.NVarChar, `Estado ${statusName}`)
//     .query(`
//       INSERT INTO SELLER_STATUS (NOMBRE, DESCRIPCION, ACTIVO)
//       OUTPUT INSERTED.ID
//       VALUES (@nombre, @desc, 1)
//     `);
//   return ins.recordset[0].ID;
// }

// async function setSellerSapIdAndStatus({ sellerId, externalSapId, newStatusName }) {
//   await IdServicePoolConnect;
//   const tx = new sql.Transaction(IdServicePool);
//   await tx.begin();
//   try {
//     const statusId = await ensureStatusId(newStatusName, tx);
//     await new sql.Request(tx)
//       .input('sellerId', sql.Int, sellerId)
//       .input('externalSapId', sql.VarChar, externalSapId)
//       .input('statusId', sql.Int, statusId)
//       .query(`
//         UPDATE SELLER
//         SET EXTERNAL_SAP_ID = @externalSapId,
//             STATUS_ID       = @statusId,
//             FECHA_ACTUALIZACION = GETDATE()
//         WHERE ID = @sellerId
//       `);
//     await tx.commit();
//   } catch (e) {
//     await tx.rollback();
//     throw e;
//   }
// }

// // Reemplaza tu fetchSalespersonByRutPlain actual por este:
// async function fetchSalespersonByRutPlain(rutPlain, cookie) {
//   // 1) Formatea el RUT con guion: 760043354 -> 76004335-4
//   let rutWithDash = rutPlain;
//   if (/^\d{8,9}$/.test(rutPlain)) {
//     rutWithDash = `${rutPlain.slice(0, -1)}-${rutPlain.slice(-1)}`;
//   }

//   // 2) Filtro EXACTO (como confirmaste que requiere SAP v1)
//   const filter = `U_RUT eq '${rutWithDash}'`;
//   const path = `/SalesPersons?$filter=${filter}`;

//   // (Solo para depurar) URL completa
//   const fullUrl = `${process.env.SAP_BASE_URL || process.env.SAP_SL_BASE_URL}${path}`;
//   console.log("[SAP][fetchSalespersonByRutPlain] Construyendo GET EXACTO:", {
//     rutPlain,
//     rutWithDash,
//     filter,
//     path,
//     fullUrl,
//   });

//   // 3) GET al Service Layer
//   const data = await sapGet(path, cookie);

//   const count = Array.isArray(data?.value) ? data.value.length : 0;
//   const row = data?.value?.[0] || null;

//   // 👀 Logea el primer match y la cantidad total
//   console.log("[SAP][GET][OK]", {
//     rutWithDash,
//     resultCount: count,
//     value: row || null,
//   });

//   // 4) Extrae el código correcto (SalesEmployeeCode) con fallbacks
//   const sapId =
//     row?.SalesEmployeeCode ?? // ← campo correcto para v1
//     null;

//   if (!sapId) return null;
//   return String(sapId);
// }



// // -- Consumer principal --
// async function startSellerValidationSapConsumer() {
//   console.log(`[Kafka][SellerValidationSapConsumer] Inicializando → topic=${TOPIC}, group=${GROUP_ID}`);

//   const consumer = kafka.consumer({ groupId: GROUP_ID });
//   await consumer.connect();
//   console.log('[Kafka] Conectado al broker');

//   await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
//   console.log(`[Kafka] Subscrito al topic ${TOPIC}`);

//   await consumer.run({
//     autoCommit: true,
//     eachMessage: async ({ topic, partition, message }) => {
//       const raw = message.value?.toString();
//       console.log(`[Kafka][${topic}] Mensaje recibido @partition=${partition}`, raw);

//       try {
//         const evt = JSON.parse(raw || '{}');
//         const seller = evt?.seller || {};
//         const sellerId = seller?.id ?? null;
//         const rutPlain = toRutPlain(seller?.rut);

//         console.log('[SellerValidation] Payload recibido', { sellerId, rutOriginal: seller?.rut, rutPlain });

//         if (!sellerId || !rutPlain) {
//           console.warn(`[${TOPIC}] payload inválido`, { sellerId, rut: seller?.rut, raw });
//           await sendBatch(DLQ_TOPIC, [{
//             key: message.key?.toString() || null,
//             value: JSON.stringify({ reason: 'invalid_payload', original: raw }),
//           }]).catch(() => {});
//           return;
//         }

//         // Login SAP
//         let cookie;
//         try {
//           const t0 = Date.now();
//           const logged = await login();
//           cookie = logged?.cookie;
//           console.log('[SAP][login][OK]', { ms: Date.now() - t0, hasCookie: !!cookie });
//         } catch (e) {
//           console.error('[SAP][login][ERROR]', e?.message);
//           throw e;
//         }

//         // GET por RUT (solo lectura)
//         const sapSalesperson = await fetchSalespersonByRutPlain(rutPlain, cookie);

//         // Logout (best effort)
//         try {
//           await logout(cookie);
//           console.log('[SAP][logout][OK]');
//         } catch (e) {
//           console.warn('[SAP][logout][WARN]', e?.message);
//         }

//         if (!sapSalesperson) {
//           console.log(`ℹ️ No existe salesperson SAP para RUT`, { rutPlain, sellerId });
//           if (RESULT_TOPIC) {
//             await sendBatch(RESULT_TOPIC, [{
//               key: String(sellerId),
//               value: JSON.stringify({
//                 event: 'seller.validation.result',
//                 version: 1,
//                 status: 'NOT_FOUND',
//                 sellerId,
//                 rut: rutPlain,
//                 ts: new Date().toISOString()
//               }),
//             }]).catch(() => {});
//           }
//           return;
//         }

//         // Si existe en SAP → actualiza EXTERNAL_SAP_ID y estado a “Activo”
//         await setSellerSapIdAndStatus({
//           sellerId,
//           externalSapId: sapSalesperson,
//           newStatusName: 'Activo',
//         });

//         console.log(`✅ Seller validado con SAP`, { sellerId, rutPlain, sapSalesperson });

//         if (RESULT_TOPIC) {
//           await sendBatch(RESULT_TOPIC, [{
//             key: String(sellerId),
//             value: JSON.stringify({
//               event: 'seller.validation.result',
//               version: 1,
//               status: 'FOUND',
//               sellerId,
//               rut: rutPlain,
//               externalSapId: sapSalesperson,
//               ts: new Date().toISOString()
//             }),
//           }]).catch(() => {});
//         }
//       } catch (err) {
//         console.error(`❌ error procesando ${TOPIC}:`, err?.message || err);
//         try {
//           await sendBatch(DLQ_TOPIC, [{
//             key: message.key?.toString() || null,
//             value: JSON.stringify({ error: String(err?.message || err), original: raw }),
//           }]);
//         } catch (dlqErr) {
//           console.error('❌ error enviando a DLQ:', dlqErr?.message || dlqErr);
//         }
//       }
//     },
//   });

//   console.log(`🟢 Consumer listo → topic=${TOPIC} | groupId=${GROUP_ID}`);
// }

// module.exports = { startSellerValidationSapConsumer };

// src/consumers/sellerValidationSapConsumer.js
const kafka = require('../../../config/kafka');
const { sql, IdServicePool, IdServicePoolConnect } = require('../../../config/dbnew');
const { toRutPlain } = require('../../../utils/rut');
const { sendBatch } = require('../../../utils/kafkaProducer');
const { login, logout, get: sapGet, post: sapPost } = require('../../../infra/sapClient');

const TOPIC = process.env.SELLER_VALIDATION_SAP_TOPIC || 'seller-validation-sap';
const RESULT_TOPIC = process.env.SELLER_VALIDATION_SAP_RESULT_TOPIC || 'seller-validation-sap.result';
const GROUP_ID = process.env.KAFKA_GROUP_ID_SAP || 'oms-service-sap-sync';
const DLQ_TOPIC = process.env.SELLER_VALIDATION_SAP_DLQ || 'seller-validation-sap.dlq';

// -- Helpers --
function toRutWithDash(rutPlain) {
  const digits = String(rutPlain || '').replace(/\D/g, '');
  if (!/^\d{8,9}$/.test(digits)) return digits;
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

// -- DB helpers --
async function ensureStatusId(statusName, tx) {
  const find = await new sql.Request(tx)
    .input('nombre', sql.NVarChar, statusName)
    .query(`SELECT ID FROM SELLER_STATUS WHERE UPPER(NOMBRE) = UPPER(@nombre)`);
  if (find.recordset.length) return find.recordset[0].ID;

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

// GET existente por RUT
async function fetchSalespersonByRutPlain(rutPlain, cookie) {
  let rutWithDash = rutPlain;
  if (/^\d{8,9}$/.test(rutPlain)) {
    rutWithDash = `${rutPlain.slice(0, -1)}-${rutPlain.slice(-1)}`;
  }

  const filter = `U_RUT eq '${rutWithDash}'`;
  const path = `/SalesPersons?$filter=${filter}`;

  const fullUrl = `${process.env.SAP_BASE_URL || process.env.SAP_SL_BASE_URL}${path}`;
  console.log("[SAP][fetchSalespersonByRutPlain] Construyendo GET EXACTO:", {
    rutPlain,
    rutWithDash,
    filter,
    path,
    fullUrl,
  });

  const data = await sapGet(path, cookie);

  const count = Array.isArray(data?.value) ? data.value.length : 0;
  const row = data?.value?.[0] || null;

  console.log("[SAP][GET][OK]", {
    rutWithDash,
    resultCount: count,
    value: row || null,
  });

  const sapId = row?.SalesEmployeeCode ?? null; // v1: SalesEmployeeCode
  return sapId ? String(sapId) : null;
}

// Crea vendedor en SAP (OSLP) cuando no existe
async function createSalespersonInSap({ seller, rutPlain, cookie }) {
  const rutWithDash = toRutWithDash(rutPlain);
  const fullName = `${(seller?.nombres || '').trim()} ${(seller?.apellidos || '').trim()}`.trim() || rutWithDash || 'Vendedor sin nombre';

  const body = {
    SalesEmployeeName: fullName,
    Active: "tYES",
    Locked: "tNO",
    Remarks: "VENDEDOR",    // <-- memo fijo solicitado
    U_RUT: rutWithDash,
  };

  console.log('[SAP][SalesPersons][POST] → body', body);

  const created = await sapPost('/SalesPersons', body, cookie);

  const newCode =
    created?.SalesEmployeeCode ??
    created?.SalesPersonCode ??
    created?.Code ??
    null;

  console.log('[SAP][SalesPersons][POST][OK]', { SalesEmployeeCode: newCode, created });

  return newCode ? String(newCode) : null;
}

// -- Consumer principal --
async function startSellerValidationSapConsumer() {
  console.log(`[Kafka][SellerValidationSapConsumer] Inicializando → topic=${TOPIC}, group=${GROUP_ID}`);

  const consumer = kafka.consumer({ groupId: GROUP_ID });
  await consumer.connect();
  console.log('[Kafka] Conectado al broker');

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[Kafka] Subscrito al topic ${TOPIC}`);

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString();
      console.log(`[Kafka][${topic}] Mensaje recibido @partition=${partition}`, raw);

      let cookie;
      try {
        const evt = JSON.parse(raw || '{}');
        const seller = evt?.seller || {};
        const sellerId = seller?.id ?? null;
        const rutPlain = toRutPlain(seller?.rut);

        console.log('[SellerValidation] Payload recibido', { sellerId, rutOriginal: seller?.rut, rutPlain });

        if (!sellerId || !rutPlain) {
          console.warn(`[${TOPIC}] payload inválido`, { sellerId, rut: seller?.rut, raw });
          await sendBatch(DLQ_TOPIC, [{
            key: message.key?.toString() || null,
            value: JSON.stringify({ reason: 'invalid_payload', original: raw }),
          }]).catch(() => {});
          return;
        }

        // Login SAP
        try {
          const t0 = Date.now();
          const logged = await login();
          cookie = logged?.cookie;
          console.log('[SAP][login][OK]', { ms: Date.now() - t0, hasCookie: !!cookie });
        } catch (e) {
          console.error('[SAP][login][ERROR]', e?.message);
          throw e;
        }

        // 1) Buscar por RUT
        let sapSalesperson = await fetchSalespersonByRutPlain(rutPlain, cookie);

        if (!sapSalesperson) {
          // 2) No existe → crear en SAP
          try {
            sapSalesperson = await createSalespersonInSap({ seller, rutPlain, cookie });
          } catch (e) {
            console.error('[SAP][SalesPersons][POST][ERROR]', e?.status, e?.data || e?.message);
            await sendBatch(DLQ_TOPIC, [{
              key: String(sellerId),
              value: JSON.stringify({
                reason: 'sap_salesperson_create_failed',
                error: String(e?.data || e?.message || e),
                sellerId,
                rut: toRutWithDash(rutPlain),
                ts: new Date().toISOString(),
              }),
            }]).catch(() => {});
            // logout best-effort y corta
            try { await logout(cookie); } catch {}
            return;
          }
        }

        if (!sapSalesperson) {
          // Si aún no hay código, notifica NOT_FOUND
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
          try { await logout(cookie); } catch {}
          return;
        }

        // 3) Actualiza DB → Activo
        await setSellerSapIdAndStatus({
          sellerId,
          externalSapId: sapSalesperson,
          newStatusName: 'Activo',
        });

        // 4) Notifica resultado FOUND o CREATED
        const status = (evt?.event === 'seller.validation.request') ? 'FOUND' : 'FOUND';
        if (RESULT_TOPIC) {
          await sendBatch(RESULT_TOPIC, [{
            key: String(sellerId),
            value: JSON.stringify({
              event: 'seller.validation.result',
              version: 1,
              status, // para diferenciar podrías setear CREATED arriba cuando venga de create
              sellerId,
              rut: rutPlain,
              externalSapId: sapSalesperson,
              ts: new Date().toISOString()
            }),
          }]).catch(() => {});
        }

        console.log(`✅ Seller validado/creado en SAP`, { sellerId, rutPlain, sapSalesperson });
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
      } finally {
        // Logout best-effort
        try { await logout(cookie); } catch {}
      }
    },
  });

  console.log(`🟢 Consumer listo → topic=${TOPIC} | groupId=${GROUP_ID}`);
}

module.exports = { startSellerValidationSapConsumer };
