// src/routes/retryRoutes.js
const express = require('express');
const { retryByCommerceId } = require('../controllers/retry.Controller');

const router = express.Router();

// POST /api/vtex-oms/retry/:commerceId?forceOms=true&forceFinance=true
router.post('/retry/:commerceId', retryByCommerceId);

module.exports = router;
