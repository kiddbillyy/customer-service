const router = require('express').Router();
const usersCtrl = require('../controllers/UserPermissionsController');


router.get ('/users/:userId/permissions', usersCtrl.getUserPermissions);
router.patch('/users/:userId/permissions', usersCtrl.updateUserPermissions);
router.get('/users/:userId/permissions/:platformId', usersCtrl.getUserPermissionsByPlatform);

module.exports = router;
