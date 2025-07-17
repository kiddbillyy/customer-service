// routes/prueba.routes.js
const express = require('express');
const router = express.Router();
const { obtenerItemFijo } = require('../controllers/prueba');

router.get('/item-cemento', obtenerItemFijo); // Ruta fija

module.exports = router;
