// src/services/kafka.js
import { Kafka, logLevel } from 'kafkajs';

let _kafka;
let _producer;

export function getKafka() {
  if (_kafka) return _kafka;
  _kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'multivende-oms',
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
    logLevel: logLevel.NOTHING,
  });
  return _kafka;
}

export async function initKafka() {
  const kafka = getKafka();
  _producer = kafka.producer();
  await _producer.connect();
}

export async function shutdownKafka() {
  await _producer?.disconnect().catch(() => {});
}

export function getProducer() {
  if (!_producer) throw new Error('Producer no inicializado. Llama initKafka() antes.');
  return _producer;
}

// 👇 añade y exporta "emit"
export async function emit(topic, payload, { key } = {}) {
  const producer = getProducer();
  const value = typeof payload === 'string' ? payload : JSON.stringify(payload);
  await producer.send({
    topic,
    messages: [{ key, value }],
  });
}
