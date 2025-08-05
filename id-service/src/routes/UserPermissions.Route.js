const router = require('express').Router();
const usersCtrl = require('../controllers/UserPermissionsController');

router.patch('/users/:userId/permissions', usersCtrl.updateUserPermissions);
module.exports = router;
