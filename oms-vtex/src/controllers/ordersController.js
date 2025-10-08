// src/controllers/ordersController.js
const { listPendingOrders } = require('../models/orderRepo.models');

async function getPendingOrders(req, res) {
  try {
    const {
      page,
      pageSize,
      sort,
      direction,
      statusIntegration,
      paymentStatusIntegration,
      commerceId,
    } = req.query;

    const result = await listPendingOrders({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sort,
      direction,
      commerceId,
      statusIntegration: (statusIntegration !== undefined && statusIntegration !== '') 
        ? Number(statusIntegration) 
        : undefined,
      paymentStatusIntegration: (paymentStatusIntegration !== undefined && paymentStatusIntegration !== '')
        ? Number(paymentStatusIntegration)
        : undefined,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('❌ getPendingOrders error:', err.message);
    return res.status(500).json({ error: 'ERROR_LIST_PENDING', message: err.message });
  }
}

module.exports = { getPendingOrders };
