// routes/index.js
const express = require('express');
const router = express.Router();

const VtexRoutes = require('./vtexRoutes')
const OrdersRoutes = require('./ordersRoutes');
const RetryRoutes = require('./retryRoutes');

router.use('/vtex', VtexRoutes, OrdersRoutes, RetryRoutes);

module.exports = router;


