/* // server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const apiRoutes = require('./routes/index');
const { connectProducer } = require('./utils/kafkaProducer');
const { startCustomerOkConsumer } = require('./utils/Kafka/consumers/CustomerOkConsumer'); 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// tus rutas
app.use('/api/oms-service', apiRoutes);

const PORT = process.env.PORT || 5010;

app.listen(PORT, async () => {
  try {
    // conecta el producer Kafka
    await connectProducer();
    console.log('✅ Kafka Producer conectado');

    // arranca el consumer de customer-ok
    await startCustomerOkConsumer();
    console.log('📥 CustomerOkConsumer iniciado');
  } catch (err) {
    console.error('❌ Error inicializando servicios Kafka:', err);
  }

  console.log(`🚀 Oms Service corriendo en puerto ${PORT}`);
});
 */
// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const apiRoutes = require('./routes/index');
const { connectProducer } = require('./utils/kafkaProducer');
const { startCustomerOkConsumer } = require('./utils/Kafka/consumers/CustomerOkConsumer');
const { startFinanceReservationCreatedConsumer } = require('./utils/Kafka/consumers/FinanceReservationCreatedConsumer');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// rutas de la API
app.use('/api/oms-service', apiRoutes);

// healthcheck (para gateway/k8s)
app.get('/health', (_req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 5010;

// ⚠️ usa la referencia del server para timeouts de keep-alive
const server = app.listen(PORT, async () => {
  try {
    // conecta el producer Kafka
    await connectProducer();
    console.log('✅ Kafka Producer conectado');

    // arranca el consumer de customer-ok
    await startCustomerOkConsumer();
    console.log('📥 CustomerOkConsumer iniciado');

    // arranca el consumer de finance.reservation.created
    await startFinanceReservationCreatedConsumer();
    console.log('📥 FinanceReservationCreatedConsumer iniciado');
  } catch (err) {
    console.error('❌ Error inicializando servicios Kafka:', err);
  }

  console.log(`🚀 Oms Service corriendo en puerto ${PORT}`);
});

// ⏱️ Ajuste de timeouts para evitar cortes prematuros
server.keepAliveTimeout = 70_000;  // 70s
server.headersTimeout   = 75_000;  // > keepAliveTimeout

