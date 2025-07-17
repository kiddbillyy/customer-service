const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
require('./jobs/stockSyncJob');   
const pricingRoutes = require('./routes/pricingRoutes')

const inventoryRoutes = require('./routes/inventoryRoutes')
const storeRoutes = require('./routes/storesRoutes')


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/inventory', inventoryRoutes);
app.use('/api/store', storeRoutes);

app.use('/api/pricing', pricingRoutes)


const PORT = process.env.PORT || 5005;
app.listen(PORT, async () => {
  console.log(`🚀 Inventory Service running on port ${PORT}`);
  
});