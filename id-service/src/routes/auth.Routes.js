const express = require('express');
const router = express.Router();
const { login, cerrarSesionController, renovarSesion  } = require('../controllers/auth.Controller');

// Endpoint de login
router.post('/login', login);
router.post('/logout', cerrarSesionController); 
router.post('/renovar', renovarSesion);
module.exports = router;
