// routes/UsuarioRol.Routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/UsuarioRolController');

router.post('/asignar-rol', ctrl.createUsuarioRol);

module.exports = router;