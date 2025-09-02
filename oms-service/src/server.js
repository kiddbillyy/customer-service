// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const apiRoutes = require('./routes/index');
const { connectProducer } = require('./utils/kafkaProducer'); 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/oms-service', apiRoutes);

const PORT = process.env.PORT || 5010;

app.listen(PORT, async () => {
  await connectProducer(); 
  console.log(`🚀 Oms Service running on port ${PORT}`);
});
