// src/routes/finance.js
const express = require('express');
const { intakePayment, getPaymentState } = require('../controller/FinancePayments.Controller');

const router = express.Router();

router.post('/', intakePayment);
router.get('/state/:orderId', getPaymentState);

module.exports = router;
