// src/routes/auditorRoutes.js
const express = require('express');
const { auditBundle } = require('../controllers/auditController');
//const { auditBundleValidator } = require('../middleware/auditValidator');
//const validateRequest = require('../middleware/validateRequest');

const router = express.Router();

// Endpoint para auditar un bulto
router.put('/bundle/:bundleID', auditBundle);

module.exports = router;
