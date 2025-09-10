// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { connectProducer } = require('./utils/kafkaProducer');
const { startCustomerOkConsumer } = require('./utils/Kafka/consumers/Customervtex'); 
const VtexIntegrations = require("./routes/index")

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/vtex-oms",VtexIntegrations)

app.get('/healthz', (_req, res) => res.send('ok'));

const PORT = process.env.PORT || 5011;

app.listen(PORT, async () => {
  try {
    // conecta el producer Kafka
    await connectProducer();
    console.log('✅ Kafka Producer conectado');
    await startCustomerOkConsumer();
    console.log('📥 Customervtex iniciado');
  } catch (err) {
    console.error('❌ Error inicializando servicios Kafka:', err);
  }

  console.log(`🚀 Oms Service corriendo en puerto ${PORT}`);
});


