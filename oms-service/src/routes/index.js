// routes/index.js
const express = require('express');
const router = express.Router();

const OrdersRoutes = require('./Orders.Routes')
const OrderStatusRoutes = require('./orderSatus.Routes');

router.use('/orders', OrderStatusRoutes, OrdersRoutes);

module.exports = router;
