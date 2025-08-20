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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Algunos errores transitorios que conviene reintentar
const RETRIABLE = /LEADER_NOT_AVAILABLE|NOT_LEADER|NOT_LEADER_OR_FOLLOWER|COORDINATOR_NOT_AVAILABLE|REQUEST_TIMED_OUT/i;

/**
 * Envía un batch con reintentos y backoff exponencial para tolerar elecciones de líder.
 */
const sendBatch = async (topic, messages) => {
  const p = await connectProducer();

  const MAX_ATTEMPTS = 6;           // ~ 1, 2, 4, 8, 16, 32 seg (tope 30s por send)
  let attempt = 0;
  let lastErr;

  while (attempt < MAX_ATTEMPTS) {
    try {
      await p.send({
        topic,
        messages,                    // [{ key, value, headers }]
        acks: 1,                     // suficiente para 1 broker
        timeout: 30000,              // margen para elección de líder
        compression: CompressionTypes.GZIP,
      });
      return; // ✅ enviado
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || '');
      if (!RETRIABLE.test(msg)) {
        // error no recuperable → propaga
        throw e;
      }
      // backoff exponencial: 1000ms, 2000ms, 4000ms, ...
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // tope 10s entre intentos
      console.warn(`⚠️ Kafka send retry (${attempt + 1}/${MAX_ATTEMPTS}) en ${delay}ms. Motivo: ${msg}`);
      // refresca metadata por si cambió el líder
      try { await p.refreshMetadata(); } catch {}
      await sleep(delay);
      attempt++;
    }
  }

  // Si agotamos reintentos, lanzamos el último error
  throw lastErr;
};

module.exports = { connectProducer, sendBatch };
