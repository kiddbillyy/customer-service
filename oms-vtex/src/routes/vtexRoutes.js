const express = require('express');
// Ahora require te da directamente la función:
const vtexIntegrations = require('../controllers/vtexController');

const router = express.Router();

// Ya no es objeto, es función
router.post('/vtex/vtex-hook', vtexIntegrations);

module.exports = router;
