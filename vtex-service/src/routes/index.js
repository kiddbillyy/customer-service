const express = require('express');
const { health } = require('../controllers/healthController');
const router = express.Router();

router.get('/health', health);   // GET /health  → { status: 'ok', ts: … }

module.exports = router;
