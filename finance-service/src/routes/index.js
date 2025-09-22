// routes/index.js
const express = require('express');
const router = express.Router();
const paymentsRoutes = require('./Finance.Routes')


router.use('/payments', paymentsRoutes);


module.exports = router;
