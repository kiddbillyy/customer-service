// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const apiRoutes = require('./routes/index');
const { connectProducer } = require('./utils/kafkaProducer');
const { startCustomerOkConsumer } = require('./utils/Kafka/consumers/CustomerOkConsumer');
const { startFinanceReservationCreatedConsumer } = require('./utils/Kafka/consumers/FinanceReservationCreatedConsumer');
const { startVtexStatusConsumer } = require('./utils/Kafka/consumers/StatusInvoiceConsumer');
const { startSellerCreatedConsumer } = require('./utils/Kafka/consumers/sellerCreatedConsumer');
const { startSellerValidationSapConsumer } = require('./utils/Kafka/consumers/sellerValidationSapConsumer');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// rutas de la API
app.use('/api/oms-service', apiRoutes);

// healthcheck (para gateway/k8s)
//app.get('/health', (_req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 5010;

// ⚠️ usa la referencia del server para timeouts de keep-alive
const server = app.listen(PORT, async () => {
  try {
    // conecta el producer Kafka
    await connectProducer();
    console.log('✅ Kafka Producer conectado');

    await startCustomerOkConsumer();
    console.log('📥 CustomerOkConsumer iniciado');

    await startFinanceReservationCreatedConsumer();
    console.log('📥 FinanceReservationCreatedConsumer iniciado');

    await startVtexStatusConsumer();
    console.log('📥 StatusInvoiceConsumer iniciado');

    await startSellerCreatedConsumer();
    console.log('📥 SellerCreatedConsumer iniciado');

    await startSellerValidationSapConsumer();
    console.log('📥 SellerValidationSapConsumer iniciado');
  } catch (err) {
    console.error('❌ Error inicializando servicios Kafka:', err);
  }
  console.log(`🚀 Oms Service corriendo en puerto ${PORT}`);

});

// Alinea con el gateway (55s) y dale holgura
server.keepAliveTimeout = 65_000;  // > proxyTimeout del gateway
server.headersTimeout   = 70_000;  // > keepAliveTimeout
server.requestTimeout   = 0;       // opcional (sin límite)
/* // ⏱️ Ajuste de timeouts para evitar cortes prematuros
server.keepAliveTimeout = 65_000;  // 70s
server.headersTimeout   = 70_000;  // > keepAliveTimeout


 */