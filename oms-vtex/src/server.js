// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { connectProducer } = require('./utils/kafkaProducer');

// 👇 importa los consumers
const { startCustomerOkConsumer } = require('./utils/Kafka/consumers/Customervtex'); 
const { startVtexStatusConsumer } = require('./utils/Kafka/consumers/VtexStatusConsumer');

const VtexIntegrations = require("./routes/index")

const { omsPreflight } = require('./services/omsService');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/vtex-oms", VtexIntegrations);

app.get('/healthz', (_req, res) => res.send('ok'));

const PORT = process.env.PORT || 5011;

app.listen(PORT, async () => {
  try {

    await omsPreflight();

    await connectProducer();
    console.log('✅ Kafka Producer conectado');

    await startCustomerOkConsumer();
    console.log('📥 Customervtex iniciado');

    await startVtexStatusConsumer();
    console.log('📥 VtexStatusConsumer iniciado');
    
  } catch (err) {
    console.error('❌ Error inicializando servicios Kafka:', err);
  }

  console.log(`🚀 Oms Service corriendo en puerto ${PORT}`);
});
