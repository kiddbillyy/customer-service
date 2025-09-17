// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { connectProducer } = require('./utils/kafka/kafkaProducer');
const consumeMessages = require('./consumer/orderConsumer');   
const { smokeTest } = require('./infra/sapClient');

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'finance-service', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 5012;

let server;
let stopConsumer = null; 

app.listen(PORT, async () => {
  console.log(`🚀 Finance Service running on port ${PORT}`);

  // 0) Info de Kafka para depurar
  const brokerForLog = process.env.KAFKA_BROKER || process.env.KAFKA_BROKERS || 'UNSET';
  const topicIn = (process.env.KAFKA_TOPIC_IN || '').trim();
  console.log(`🔌 Kafka broker: ${brokerForLog} | topic in: ${topicIn || '(no definido)'}`);

  // 1) Conectar Producer (si publicarás OK/DLQ)
  try {
    await connectProducer();
    console.log('✅ Kafka Producer conectado (finance-service)');
  } catch (e) {
    console.warn('⚠️ No se pudo conectar el Producer Kafka (continuo sin producer):', e?.message || e);
  }

  // 2) Arrancar Consumer
  try {
    const maybeStop = await consumeMessages(); // debería suscribirse a KAFKA_TOPIC_IN
    if (typeof maybeStop === 'function') stopConsumer = maybeStop;
    console.log('📥 Kafka consumer started');
  } catch (err) {
    console.error('❌ Error starting Kafka consumer:', err?.message || err);
  }

  // 3) Smoke test de SAP (opcional)
  if (process.env.SAP_SMOKE_TEST_ON_BOOT !== 'false') {
    try {
      const res = await smokeTest();
      if (res.ok) {
        console.log(`✅ SAP login OK (session: ${res.sessionId})`);
      } else {
        console.error('❌ SAP login FAILED:', res.error);
      }
    } catch (e) {
      console.error('❌ SAP smoke test error:', e?.message || e);
    }
  }
});