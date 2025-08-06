// routes/roles.js
const router = require('express').Router();
const ctrl   = require('../controllers/RoleController');

router.get('/estructura/:platCod', ctrl.getStructure);
router.post('/create-rol', ctrl.createRole);
router.get('/all-roles', ctrl.getAllRoles);
router.get('/role/:roleId', ctrl.getRoleById);
router.post('/permisos/:roleId', ctrl.addPermissionsToRole);
router.put('/role/:roleId', ctrl.updateRole);
router.get('/roles', ctrl.listRoles);
module.exports = router;
