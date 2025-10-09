// src/routes/seller.routes.js
const express = require('express');
const { getSellers, getSellerStatuses, getSellerByRutController } = require('../controllers/seller.Controller');
const router = express.Router();

router.get('/sellers', getSellers);
router.get('/seller-status', getSellerStatuses);
router.get('/sellers/:rut', getSellerByRutController);

module.exports = router;
