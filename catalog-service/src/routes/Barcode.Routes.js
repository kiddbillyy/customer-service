// routes/barcodes.routes.js
const express = require('express');
const router = express.Router();
const { listBarcodes, getBarcodesByItemCode } = require('../controllers/Barcode.controller');

// ?itemCode=...  -> si viene, ignora page/pageSize (como definiste)
router.get('/barcodes', listBarcodes);
router.get('/barcodes/:itemCode', getBarcodesByItemCode);

module.exports = router;
