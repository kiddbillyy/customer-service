// routes/roles.js
const router = require('express').Router();
const ctrl   = require('../controllers/RoleController');

router.get('/estructura/:platCod', ctrl.getStructure);
router.post('/', ctrl.createRole);

module.exports = router;
