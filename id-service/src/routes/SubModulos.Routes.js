// routes/submodulos.js
const router = require('express').Router();
const ctrl   = require('../controllers/SubModulos.Controller');

// POST /submodulos
router.post('/submodulos', ctrl.createSubModulo);

module.exports = router;