// workers/vtexSync.js
require('dotenv').config();
const { startCustomerOkConsumer } = require('../utils/Kafka/consumers/Customervtex');

startCustomerOkConsumer().catch((e) => {
  console.error('Fallo al iniciar consumer:', e);
  process.exit(1);
});
