const express = require('express');
const router = express.Router();
const { crearUsuario, editarUsuario, listarUsuarios } = require('../controllers/Usuario.Controller');

router.post('/crear', crearUsuario);
router.put('/editar/:id', editarUsuario);
router.get('/', listarUsuarios);

module.exports = router;
