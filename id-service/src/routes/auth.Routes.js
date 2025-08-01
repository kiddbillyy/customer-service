const express = require('express');
const router = express.Router();
const { login } = require('../controllers/auth.Controller');

// Endpoint de login
router.post('/login', login);

module.exports = router;
