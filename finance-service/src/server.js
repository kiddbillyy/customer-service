// server.js (o index.js)
require('dotenv').config();
const express = require('express');
const cors = require('cors');


// const consumeMessages = require('./consumer/ordersConsumer'); 
const { smokeTest } = require('./infra/sapClient');

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck básico
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'finance-service', time: new Date().toISOString() });
});

const PORT = process.env.PORT;
app.listen(PORT, async () => {
  console.log(`🚀 Finance Service running on port ${PORT}`);

  // // 1) Arranca el consumer Kafka
  // try {
  //   await consumeMessages();
  //   console.log('📥 Kafka consumer started');
  // } catch (err) {
  //   console.error('❌ Error starting Kafka consumer:', err?.message || err);
  // }

  // 2) Smoke test de SAP al boot (controlable por env)
  if (process.env.SAP_SMOKE_TEST_ON_BOOT !== 'false') {
    const res = await smokeTest();
    if (res.ok) {
      console.log(`✅ SAP login OK (session: ${res.sessionId})`);
    } else {
      console.error('❌ SAP login FAILED:', res.error);
    }
  }
});
