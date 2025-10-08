// src/routes/ordersRoutes.js
const express = require('express');
const { getPendingOrders } = require('../controllers/ordersController');

const router = express.Router();

// GET /api/vtex-oms/orders/pending?statusIntegration=0&paymentStatusIntegration=0&commerceId=...&page=1&pageSize=50&sort=updatedAt&direction=DESC
router.get('/orders/pending', getPendingOrders);

module.exports = router;
