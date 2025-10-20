const { Kafka, logLevel } = require('kafkajs');
const { kafka: cfg } = require('./config');
const log = require('./logger');

const kafka = new Kafka({
  clientId: cfg.clientId,
  brokers: cfg.brokers,
  logLevel: logLevel.NOTHING
});

const producer = kafka.producer();

async function connect() {
  await producer.connect();
  log.info({ brokers: cfg.brokers }, 'Kafka connected');
}

async function publishPOCancelled({ key, payload }) {
  return producer.send({
    topic: cfg.topicPOCancelled,
    messages: [{ key, value: payload }]
  });
}

async function publishPaymentReceived({ key, payload }) {
  return producer.send({
    topic: cfg.topicPaymentReceived,   // 👈 nuevo topic desde config/.env
    messages: [{ key, value: payload }]
  });
}

async function disconnect() {
  try { await producer.disconnect(); } catch {}
}

module.exports = {
  connect,
  publishPOCancelled,
  publishPaymentReceived,  // 👈 export nuevo
  disconnect
};
