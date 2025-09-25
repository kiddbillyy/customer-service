// utils/kafka/kafkaProducer.js
const { CompressionTypes } = require('kafkajs');
const kafka = require('../../config/kafka');

const producer = kafka.producer();

const connectProducer = async () => {
  if (!producer._isConnected) {
    await producer.connect();
    producer._isConnected = true;
  }
  return producer;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const RETRIABLE = /LEADER_NOT_AVAILABLE|NOT_LEADER|NOT_LEADER_OR_FOLLOWER|COORDINATOR_NOT_AVAILABLE|REQUEST_TIMED_OUT/i;


const sendBatch = async (topic, messages) => {
  const p = await connectProducer();

  const MAX_ATTEMPTS = 6;           
  let attempt = 0;
  let lastErr;

  while (attempt < MAX_ATTEMPTS) {
    try {
      await p.send({
        topic,
        messages,                    
        acks: 1,                    
        timeout: 30000,            
        compression: CompressionTypes.GZIP,
      });
      return;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || '');
      if (!RETRIABLE.test(msg)) {
        throw e;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000); 
      console.warn(`⚠️ Kafka send retry (${attempt + 1}/${MAX_ATTEMPTS}) en ${delay}ms. Motivo: ${msg}`);
      try { await p.refreshMetadata(); } catch {}
      await sleep(delay);
      attempt++;
    }
  }

  throw lastErr;
};

module.exports = { connectProducer, sendBatch };
