const express = require('express');
const router = express.Router();
const { login, cerrarSesionController, renovarSesion, solicitarRecuperacionController, cambiarContraseña, verificarOtpValido } = require('../controllers/auth.Controller');

// Endpoint de login
router.post('/login', login);
router.post('/logout', cerrarSesionController); 
router.post('/renovar', renovarSesion);
router.post('/recuperar', solicitarRecuperacionController);
router.post('/cambiar-contrasena', cambiarContraseña);
router.post('/verificar-otp', verificarOtpValido);
module.exports = router;
