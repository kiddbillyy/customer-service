// server.js
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
