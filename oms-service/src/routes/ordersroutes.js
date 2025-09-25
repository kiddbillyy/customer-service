const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/OrdersController');

router.get('/get', ctrl.getOrders);         
router.get('/get/:orderId', ctrl.getOrderById);

module.exports = router;
