// src/routes/warehouses.routes.js
const { Router } = require('express');
const { 
  getWarehousesCtrl, 
  getWarehouseByCodeCtrl 
} = require('../controllers/warehouseController');

const router = Router();

// ✅ Listar todos los almacenes
router.get('/warehouses', getWarehousesCtrl);

// ✅ Obtener un almacén por su código
router.get('/warehouses/:code', getWarehouseByCodeCtrl);

module.exports = router;
