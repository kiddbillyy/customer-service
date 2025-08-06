// routes/UsuarioRol.Routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/UsuarioRolController');

router.post('/asignar-rol', ctrl.createUsuarioRol);
router.patch('/users/:userId/roles/:roleId', ctrl.toggleUsuarioRol);

module.exports = router;