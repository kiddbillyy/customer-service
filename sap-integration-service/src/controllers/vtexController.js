const { handleVtexIntegration } = require('../services/vtexIntegrationService');

async function vtexIntegrations(req, res) {
  try {
    await handleVtexIntegration(req.body);
    return res.status(200).json({ message: 'VTEX hook procesado correctamente' });
  } catch (err) {
    console.error('Error en vtexIntegrations:', err);
    return res.status(500).json({ error: 'Error interno al procesar VTEX hook' });
  }
}

module.exports = vtexIntegrations;
