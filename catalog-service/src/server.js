const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { connectProducer } = require('./utils/kafkaProducer'); 
require('./sheduler/scheduler_OITM_ITM1');   
const pruebaRoutes = require('./routes/Routes');
const categoryRoutes = require('./routes/Category.Routes');
const pruebaRoutes = require('./routes/Routes');


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/catalog', categoryRoutes, pruebaRoutes);

const PORT = process.env.PORT || 5006;

app.listen(PORT, async () => {
  await connectProducer(); 
  console.log(`🚀 Catalog Service running on port ${PORT}`);
});
