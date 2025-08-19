// utils/kafkaProducer.js
const { CompressionTypes } = require('kafkajs');
const kafka = require('../config/kafka');

const producer = kafka.producer();

const connectProducer = async () => {
  if (!producer._isConnected) {
    await producer.connect();
    producer._isConnected = true;
    console.log('🟢 Kafka Producer conectado (commerce-service)');
  }
  return producer;
};

const sendBatch = async (topic, messages) => {
  const p = await connectProducer();
  await p.send({
    topic,
    messages, // [{ key, value, headers }]
    compression: CompressionTypes.GZIP,
  });
};

module.exports = { connectProducer, sendBatch };
