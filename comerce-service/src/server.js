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

app.use('/api/comerce-service', apiRoutes);

const PORT = process.env.PORT || 5009;

app.listen(PORT, async () => {
  await connectProducer(); 
  console.log(`🚀 Comerce Service running on port ${PORT}`);
});
