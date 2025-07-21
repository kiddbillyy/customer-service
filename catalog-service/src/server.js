const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
require('./sheduler/scheduler_OITM_ITM1');   
require('./sheduler/catalogCategoryScheduler');

const pruebaRoutes = require('./routes/prueba.Routes');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/catalog', pruebaRoutes); 

const PORT = process.env.PORT || 5006;
app.listen(PORT, async () => {
  console.log(`🚀 Catalog Service running on port ${PORT}`);
});