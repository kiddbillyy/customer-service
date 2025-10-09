// src/routes/seller.routes.js
const express = require('express');
const { getSellers, getSellerStatuses } = require('../controllers/seller.Controller');
const router = express.Router();

router.get('/sellers', getSellers);
router.get('/seller-status', getSellerStatuses);

module.exports = router;
