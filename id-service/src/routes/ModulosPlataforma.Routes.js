// routes/modulos-plataforma.js
const router = require('express').Router();
const ctrl   = require('../controllers/ModulosPlataforma.Controller');

// POST /modulos-plataforma
router.post('/modulos-plataforma', ctrl.createModuloPlataforma);

module.exports = router;