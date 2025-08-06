const express = require('express');
const router = express.Router();
const { login, cerrarSesionController, renovarSesion, solicitarRecuperacionController, cambiarContraseña } = require('../controllers/auth.Controller');

// Endpoint de login
router.post('/login', login);
router.post('/logout', cerrarSesionController); 
router.post('/renovar', renovarSesion);
router.post('/recuperar', solicitarRecuperacionController);
router.post('/cambiar-contrasena', cambiarContraseña);
module.exports = router;
