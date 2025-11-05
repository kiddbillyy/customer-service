// src/producer/customerOkProducer.js
import { Kafka, logLevel } from 'kafkajs';

// Lee ambos nombres por compatibilidad
const BROKERS   = (process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'kafka:9092').split(',');
const CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'customer-service';
const TOPIC_OUT = (process.env.KAFKA_CUSTOMER_OK_TOPIC || 'customer-ok');

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

/**
 * Emite customer-ok.
 * @param {Object} params
 * @param {number|string|null} params.orderId
 * @param {boolean|string} params.ok             - Se enviará como 'true'/'false' (string).
 * @param {string|null} params.cardCode
 * @param {string|null} [params.message]         - Texto para cuando ok=false (antes 'error').
 * @param {string|null} [params.error]           - AÚN aceptado por compatibilidad; se mapea a 'mensaje'.
 */
export async function emitCustomerOk({ orderId, ok, cardCode, message, error }) {
  const p = await ensureProducer();

  // compat: si no viene 'mensaje' pero sí 'error', úsalo
  const msg = (message && String(message).trim())
    ? String(message).trim()
    : (error && String(error).trim())
      ? String(error).trim()
      : null;

  const payload = {
    OrderID: Number(orderId) || null,
    ok: ok ? 'true' : 'false',   // mantiene tu formato
    CardCode: cardCode ?? null,
  };

  if (msg) payload.message = msg;

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
