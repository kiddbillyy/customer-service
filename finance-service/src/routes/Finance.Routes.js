// src/routes/finance.js
const express = require('express');
const { intakePayment, getPaymentState,getPaymentIntake } = require('../controller/FinancePayments.Controller');

const router = express.Router();

router.post('/', intakePayment);
router.get('/state/:orderId', getPaymentState);
router.get('/intake/:orderId',getPaymentIntake)

module.exports = router;
