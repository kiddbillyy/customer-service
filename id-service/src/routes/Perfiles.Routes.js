const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/Perfiles.Controller');

router.put('/editar/:id', usuarioController.editarPerfil);

module.exports = router;
