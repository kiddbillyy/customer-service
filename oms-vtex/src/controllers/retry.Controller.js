// src/controllers/retryController.js
const { retryIntegrationByCommerceId } = require('../services/retryService');

async function retryByCommerceId(req, res) {
  try {
    const { commerceId } = req.params;
    const forceOms     = String(req.query.forceOms || 'false').toLowerCase() === 'true';
    const forceFinance = String(req.query.forceFinance || 'false').toLowerCase() === 'true';

    if (!commerceId) return res.status(400).json({ error: 'commerceId requerido' });

    const result = await retryIntegrationByCommerceId(commerceId, { forceOms, forceFinance });
    if (!result.ok && result.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('❌ retryByCommerceId error:', err.message);
    return res.status(500).json({ error: 'ERROR_RETRY', message: err.message });
  }
}

module.exports = { retryByCommerceId };
