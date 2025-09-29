// routes/orders.js
const express = require('express');
const ctrl = require('../controllers/Orders.Controller');
const { getOrdersView } = require('../controllers/OrdersController');

const router = express.Router();
router.post('/', ctrl.createOrder);
router.patch('/:id', ctrl.patchOrder);

router.get('/summary', getOrdersView);

router.get('/', ctrl.getOrders);
router.get('/:id', ctrl.getOrders);


module.exports = router;