const express = require('express');
const vtexIntegrations = require('../controllers/vtexController');

const router = express.Router();

router.post('/vtex/vtex-hook', vtexIntegrations);

module.exports = router;
