const express = require('express');
const { runScheduler, createNewOrder } = require('../controllers/schedulerController');

const router = express.Router();

// Rutas
router.post('/execute', runScheduler); // API para ejecutar el tarea programada de importación de órdenes desde SAP
router.post('/create/:folionum', createNewOrder); // API para crear una orden a partir de un folionum en Retail Pro

module.exports = router;