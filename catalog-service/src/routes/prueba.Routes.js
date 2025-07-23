// routes/prueba.routes.js
const express = require('express');
const router = express.Router();
const { obtenerItemFijo } = require('../controllers/prueba');
const listPriceController = require('../controllers/price-list');

router.get('/listprices', listPriceController.getListPrices);
router.get('/listprices/:itemCode/:priceList', listPriceController.getListPriceById);
router.get('/item-cemento', obtenerItemFijo);
module.exports = router;
