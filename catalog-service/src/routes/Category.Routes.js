const express = require('express');
const router = express.Router();
const { obtenerCategorias } = require('../controllers/Category.controller');

router.get('/getcategory', obtenerCategorias);

module.exports = router;
