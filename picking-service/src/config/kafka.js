const { Kafka } = require('kafkajs');
require('dotenv').config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'picking-service',
  brokers: [process.env.KAFKA_BROKER]
});

module.exports = kafka;