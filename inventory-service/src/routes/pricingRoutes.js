const express = require('express');
const { getSkuWithPrice } = require('../controllers/pricingController');
const { updatePrices } = require('../controllers/pricingController');

const router = express.Router();

/**
 * GET /api/pricing/sku?refId=050001051
 */
router.get('/sku', getSkuWithPrice);
router.post('/update', updatePrices);
module.exports = router;
