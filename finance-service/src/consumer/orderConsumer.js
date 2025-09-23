// // src/consumer/ordersConsumer.js
// const { Kafka } = require("kafkajs");
// const { processOrder } = require("../services/jobService");
// const { sendBatch } = require("../utils/kafka/kafkaProducer");
// const { normalizeSlError } = require("../utils/errorNormalize");

// const {
//   KAFKA_BROKER = "localhost:9092",
//   KAFKA_CLIENT_ID ="finance-service",
//   KAFKA_GROUP_ID = "finance-service-group",
//   KAFKA_TOPIC_IN = "finance.orders.reserve",         
//   KAFKA_TOPIC_OK = "finance.reservation.created",     
//   KAFKA_TOPIC_DLQ = "finance.deadletter",            
// } = process.env;

// module.exports = async function consumeMessages() {
//   const kafka = new Kafka({
//     clientId: KAFKA_CLIENT_ID,
//     brokers: KAFKA_BROKER.split(",").map(s => s.trim()),
//   });

//   const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });
//   await consumer.connect();
//   await consumer.subscribe({ topic: KAFKA_TOPIC_IN, fromBeginning: false });

//   await consumer.run({
//     autoCommit: true,
//     eachMessage: async ({ topic, partition, message }) => {
//       const raw = message.value?.toString() || "{}";
//       let evt;
//       try {
//         evt = JSON.parse(raw);
//       } catch {
//         // mensaje mal formado → DLQ
//         await sendBatch(KAFKA_TOPIC_DLQ, [{
//           key: null,
//           value: JSON.stringify({ reason: "BAD_JSON", raw })
//         }]);
//         return;
//       }

//       const u_ref1 = evt.u_ref1 || evt.orderId || evt.U_REF1;
//       if (!u_ref1) {
//         await sendBatch(KAFKA_TOPIC_DLQ, [{
//           key: null,
//           value: JSON.stringify({ reason: "MISSING_U_REF1", evt })
//         }]);
//         return;
//       }

//       try {
//         const state = await processOrder(u_ref1); // ← solo factura de reserva
//         // publicar éxito
//         await sendBatch(KAFKA_TOPIC_OK, [{
//           key: u_ref1,
//           value: JSON.stringify({
//             u_ref1,
//             invoiceDocEntry: state.invoiceDocEntry,
//             invoiceDocNum: state.invoiceDocNum,
//             invoiceFolioNum: state.invoiceFolioNum,
//             invoiceDocTotal: state.invoiceDocTotal,
//             ts: new Date().toISOString()
//           })
//         }]);
//         console.log(`✅ Reserva OK u_ref1=${u_ref1} DocEntry=${state.invoiceDocEntry}, DocNum=${state.invoiceDocNum}, FolioNum=${state.invoiceFolioNum}`);
//         } catch (err) {
//         const norm = normalizeSlError(err);
//         const errorPayload = {
//             u_ref1,
//             error: {
//             code: norm.code,
//             httpStatus: norm.httpStatus,
//             message: norm.message, 
//             },
//             ts: new Date().toISOString()
//         };
//         console.error("❌ Error Reserva:", errorPayload);
//         // publicar a DLQ
//         await sendBatch(KAFKA_TOPIC_DLQ, [{
//           key: u_ref1,
//           value: JSON.stringify(errorPayload),
//           headers: { "x-reason": Buffer.from("RESERVE_FAILED") }
//         }]);
//       }
//     },
//   });


//   return async () => {
//     try { await consumer.disconnect(); } catch {}
//   };
// };

// src/consumer/ordersConsumer.js
const { Kafka } = require("kafkajs");
const { processOrder } = require("../services/jobService");
const { sendBatch } = require("../utils/kafka/kafkaProducer");
const { normalizeSlError } = require("../utils/errorNormalize");

const {
  KAFKA_BROKER = "localhost:9092",
  KAFKA_CLIENT_ID = "finance-service",
  KAFKA_GROUP_ID = "finance-service-group",

  // Topics de entrada / salida actuales
  KAFKA_TOPIC_IN  = "finance.orders.reserve",
  KAFKA_TOPIC_OK  = "finance.reservation.created",
  KAFKA_TOPIC_DLQ = "finance.deadletter",

  // Topic para OMS/VTEX status
  KAFKA_TOPIC_VTEX_STATUS = "vtex.status",

  // Config de evento VTEX status
  VTEX_STATUS_EVENT1 = "start-handling", 
  VTEX_STATUS_SOURCE      = "finance"
} = process.env;

module.exports = async function consumeMessages() {
  const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKER.split(",").map(s => s.trim()),
  });

  const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC_IN, fromBeginning: false });

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString() || "{}";
      let evt;
      try {
        evt = JSON.parse(raw);
      } catch {
        // mensaje mal formado → DLQ
        await sendBatch(KAFKA_TOPIC_DLQ, [{
          key: null,
          value: JSON.stringify({ reason: "BAD_JSON", raw })
        }]);
        return;
      }

      // u_ref1 es tu commerceId
      const u_ref1 = evt.u_ref1 || evt.orderId || evt.U_REF1;
      if (!u_ref1) {
        await sendBatch(KAFKA_TOPIC_DLQ, [{
          key: null,
          value: JSON.stringify({ reason: "MISSING_U_REF1", evt })
        }]);
        return;
      }

      try {
        // Procesa la orden (genera factura de reserva)
        const state = await processOrder(u_ref1);

        // 1) Publicar éxito interno (para tu tracking)
        await sendBatch(KAFKA_TOPIC_OK, [{
          key: u_ref1,
          value: JSON.stringify({
            u_ref1,
            invoiceDocEntry: state.invoiceDocEntry,
            invoiceDocNum: state.invoiceDocNum,
            invoiceFolioNum: state.invoiceFolioNum,
            invoiceDocTotal: state.invoiceDocTotal,
            ts: new Date().toISOString()
          })
        }]);

        // 2) Publicar estado para OMS/VTEX
        //    - commerceId = u_ref1
        //    - state se toma de VTEX_STATUS_EVENT1 
        //    - source = 'finance' (configurable)
        //    - eventId único para trazabilidad (puedes reemplazar por uuid v4 si ya lo usas)
        const eventId = `finance-${u_ref1}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        await sendBatch(KAFKA_TOPIC_VTEX_STATUS, [{
          key: u_ref1, 
          value: JSON.stringify({
            commerceId: u_ref1,
            state: String(VTEX_STATUS_EVENT1).trim(),
            source: String(VTEX_STATUS_SOURCE).trim(),
            eventId
          }),
          headers: {
            "x-event-id": Buffer.from(eventId)
          }
        }]);

        console.log(`✅ Reserva OK u_ref1=${u_ref1} DocEntry=${state.invoiceDocEntry}, DocNum=${state.invoiceDocNum}, FolioNum=${state.invoiceFolioNum}`);
      } catch (err) {
        const norm = normalizeSlError(err);
        const errorPayload = {
          u_ref1,
          error: {
            code: norm.code,
            httpStatus: norm.httpStatus,
            message: norm.message,
          },
          ts: new Date().toISOString()
        };
        console.error("❌ Error Reserva:", errorPayload);

        await sendBatch(KAFKA_TOPIC_DLQ, [{
          key: u_ref1,
          value: JSON.stringify(errorPayload),
          headers: { "x-reason": Buffer.from("RESERVE_FAILED") }
        }]);
      }
    },
  });

  return async () => {
    try { await consumer.disconnect(); } catch {}
  };
};


