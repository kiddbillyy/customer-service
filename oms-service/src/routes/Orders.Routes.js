// routes/orders.js
const express = require('express');
const ctrl = require('../controllers/Orders.Controller');

const router = express.Router();
router.post('/', ctrl.createOrder);
router.patch('/:id', ctrl.patchOrder);

router.get('/', ctrl.getOrders);
router.get('/:id', ctrl.getOrders);
// si prefieres PUT (reemplazo completo de items), puedes usar el mismo handler con body.replaceItems = true
module.exports = router;