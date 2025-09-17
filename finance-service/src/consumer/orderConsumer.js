// src/consumer/ordersConsumer.js
const { Kafka } = require("kafkajs");
const { processOrder } = require("../services/jobService");
const { sendBatch } = require("../utils/kafka/kafkaProducer");
const { normalizeSlError } = require("../utils/errorNormalize");

const {
  KAFKA_BROKER = "localhost:9092",
  KAFKA_CLIENT_ID ="finance-service",
  KAFKA_GROUP_ID = "finance-service-group",
  KAFKA_TOPIC_IN = "finance.orders.reserve",          // donde llega u_ref1
  KAFKA_TOPIC_OK = "finance.reservation.created",     // éxito
  KAFKA_TOPIC_DLQ = "finance.deadletter"              // errores
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

      const u_ref1 = evt.u_ref1 || evt.orderId || evt.U_REF1;
      if (!u_ref1) {
        await sendBatch(KAFKA_TOPIC_DLQ, [{
          key: null,
          value: JSON.stringify({ reason: "MISSING_U_REF1", evt })
        }]);
        return;
      }

      try {
        const state = await processOrder(u_ref1); // ← solo factura de reserva
        // publicar éxito
        await sendBatch(KAFKA_TOPIC_OK, [{
          key: u_ref1,
          value: JSON.stringify({
            u_ref1,
            invoiceDocEntry: state.invoiceDocEntry,
            invoiceDocNum: state.invoiceDocNum,
            invoiceDocTotal: state.invoiceDocTotal,
            ts: new Date().toISOString()
          })
        }]);
        console.log(`✅ Reserva OK u_ref1=${u_ref1} DocEntry=${state.invoiceDocEntry}, DocNum=${state.DocNum}`);
        } catch (err) {
        const norm = normalizeSlError(err);
        const errorPayload = {
            u_ref1,
            error: {
            code: norm.code,
            httpStatus: norm.httpStatus,
            message: norm.message, // ← ya NO será [Object]
            },
            ts: new Date().toISOString()
        };
        console.error("❌ Error Reserva:", errorPayload);
        // publicar a DLQ
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
