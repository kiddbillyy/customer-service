// routes/orders.js
const express = require('express');
const ctrl = require('../controllers/Orders.Controller');
const { getOrdersView } = require('../controllers/OrdersController');
const { getOrderIssueSummary } = require('../controllers/OrdersDetails.Controller')

const router = express.Router();
router.post('/', ctrl.createOrder);
router.patch('/:id', ctrl.patchOrder);

router.get('/summary', getOrdersView);
router.get('/:orderId/issue-summary', getOrderIssueSummary);


router.get('/', ctrl.getOrders);
router.get('/:id', ctrl.getOrders);

router.get('/customers/pending', ctrl.getCustomersPendingIntegration);
module.exports = router;