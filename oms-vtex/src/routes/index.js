// routes/index.js
const express = require('express');
const router = express.Router();

const OrdersRoutes = require('./Orders.Routes')

router.use('/orders', OrdersRoutes);

module.exports = router;
