// src/producer/customerOkProducer.js
import { Kafka, logLevel } from 'kafkajs';

// Lee ambos nombres por compatibilidad
const BROKERS   = (process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'kafka:9092').split(',');
const CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'customer-service';
const TOPIC_OUT = process.env.KAFKA_CUSTOMER_OK_TOPIC || 'customer-ok';

const kafka = new Kafka({ clientId: CLIENT_ID, brokers: BROKERS, logLevel: logLevel.INFO });
const producer = kafka.producer({ allowAutoTopicCreation: true });

// ---- Health local opcional (no imprescindible para /readyz)
let _connected = false;
producer.on(producer.events.CONNECT,    () => { _connected = true;  console.log('[Kafka][customer-ok] PRODUCER CONNECT'); });
producer.on(producer.events.DISCONNECT, () => { _connected = false; console.warn('[Kafka][customer-ok] PRODUCER DISCONNECT'); });

async function ensureProducer() {
  if (!_connected) {
    await producer.connect();
    _connected = true;
  }
  return producer;
}

export async function emitCustomerOk({ orderId, ok, cardCode }) {
  const p = await ensureProducer();
  const payload = {
    OrderID: Number(orderId) || null,
    ok: ok ? 'true' : 'false', // siempre string
    CardCode: cardCode ?? null
  };
  await p.send({
    topic: TOPIC_OUT,
    messages: [{ key: String(orderId ?? ''), value: JSON.stringify(payload) }]
  });
  console.log('[customer-ok] sent', payload);
}

export async function stopCustomerOkProducer() {
  try { await producer.disconnect(); } catch {}
  _connected = false;
}
