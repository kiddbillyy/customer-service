// routes/index.js
const express = require('express');
const router = express.Router();

const OrdersRoutes = require('./Orders.Routes')
const OrderStatusRoutes = require('./orderSatus.Routes');
const SellerRoutes = require('./seller.Routes');

router.use('/orders', SellerRoutes, OrderStatusRoutes, OrdersRoutes);

module.exports = router;
