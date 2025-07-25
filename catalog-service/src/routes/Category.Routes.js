const express = require('express');
const router = express.Router();
const { obtenerCategorias, obtenerPrimerNivel, obtenerArbolCategorias, obtenerSubcategorias } = require('../controllers/Category.controller');

router.get('/getcategory', obtenerCategorias);
router.get('/getfirstlevel', obtenerPrimerNivel);
router.get('/getcategorytree', obtenerArbolCategorias);
router.get('/getsubcategory/:id', obtenerSubcategorias);

module.exports = router;
