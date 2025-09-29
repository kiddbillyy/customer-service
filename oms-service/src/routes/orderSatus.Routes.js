const express = require('express');
const { listarOrderStatuses } = require('../controllers/orderStatus.Controller');

const router = express.Router();

// GET /api/oms-service/
router.get('/status', listarOrderStatuses);

module.exports = router;
