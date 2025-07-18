// routes/prueba.routes.js
const express = require('express');
const router = express.Router();
const { obtenerItemFijo } = require('../controllers/prueba');
const {obtenerListaDePrecios} = require('../controllers/price-list')


router.get('/lista-precios',obtenerListaDePrecios)
router.get('/item-cemento', obtenerItemFijo);
module.exports = router;
