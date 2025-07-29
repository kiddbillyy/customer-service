// routes/Routes.js
const express = require('express');
const router = express.Router();
const listPriceController = require('../controllers/price-list');
const productCtrl = require('../controllers/Product-Controller');
const priceListCtrl = require('../controllers/ListPrice-Controller');

/* ──────────── Products ──────────── */
router.get('/products', productCtrl.getProducts);
router.get('/products/:itemCode', productCtrl.getProductBySku);

/* ──────────── Price List OPLN ──────────── */
router.get('/price-lists',           priceListCtrl.getPriceLists);
router.get('/price-lists/:listNum',  priceListCtrl.getPriceListById);

/* ──────────── LIST PRICES ITM1 ──────────── */
router.get('/listprices', listPriceController.getListPrices);
router.get('/listprices/:itemCode/:priceList', listPriceController.getListPriceById);

module.exports = router;