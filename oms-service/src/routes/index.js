// routes/index.js
const express = require('express');
const router = express.Router();

const OrdersRoutes = require('./Orders.Routes')
const OrderRoutes = require('./ordersroutes');

router.use('/orders', OrdersRoutes, OrderRoutes);

module.exports = router;
