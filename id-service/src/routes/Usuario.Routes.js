const express = require('express');
const router = express.Router();
const { crearUsuario, editarUsuario } = require('../controllers/Usuario.Controller');

router.post('/crear', crearUsuario);
router.put('/editar/:id', editarUsuario);

module.exports = router;
