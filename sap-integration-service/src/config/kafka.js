// src/config/kafka.js
const { Kafka } = require('kafkajs');
const { kafka } = require('./index');

const kafkaClient = new Kafka({
  clientId: kafka.clientId,
  brokers: kafka.brokers
});

module.exports = kafkaClient;
