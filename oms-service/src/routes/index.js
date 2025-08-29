// routes/index.js
const express = require('express');
const router = express.Router();
const geofencesRoutes = require('./Geofences.Routes');

const OrdersRoutes = require('./Orders.Routes')



router.use('/orders', OrdersRoutes);



module.exports = router;
