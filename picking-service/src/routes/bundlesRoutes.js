// src/routes/bundlesRoutes.js
const express = require('express');
const {
  createBundle,  
  getBundlesByOrder, 
  getBundleDetails,
  getOrderProductsWithBundleID,
  getAllBundles
} = require('../controllers/bundlesController');

const {
  createBundleValidator,
  getBundleDetailsValidator,
  getBundlesByOrderValidator,
  getOrderProductsWithBundleIDValidator
} = require('../middleware/bundlesValidator');

const validateRequest = require('../middleware/validateRequest');

const router = express.Router();

// Crear un bulto
router.post('/', createBundleValidator, validateRequest, createBundle);

// Obtener todos los bultos
router.get('/', getAllBundles);

// Obtener bultos de una orden
router.get('/:orderID', getBundlesByOrderValidator, validateRequest, getBundlesByOrder);

// Obtener detalles de un bulto
router.get('/bundle/:bundleID', getBundleDetailsValidator, validateRequest, getBundleDetails);

// Obtener productos con bundleID
router.get('/order-products/:orderID', getOrderProductsWithBundleIDValidator, validateRequest, getOrderProductsWithBundleID);

module.exports = router;
