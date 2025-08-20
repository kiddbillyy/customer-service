const PricingService = require('../services/pricingService');

/**
 * Devuelve SKU + precios en un solo objeto.
 * Query param: refId (obligatorio)
 */
exports.getSkuWithPrice = async (req, res) => {
  const { refId } = req.query;

  if (!refId) {
    return res.status(400).json({ message: 'Parámetro refId faltante' });
  }

  try {
    const data = await PricingService.fetchSkuAndPrice(refId);
    if (!data) {
      return res.status(404).json({ message: 'SKU no encontrado' });
    }
    res.json(data);
  } catch (err) {
    console.error('❌ Error obteniendo SKU + precios:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updatePrices = async (req, res) => {
  try {
    const { vtex, sap } = req.body;

    if (!vtex?.itemId || !sap?.itemCode) {
      return res.status(400).json({ message: 'Faltan itemId (VTEX) o itemCode (SAP)' });
    }

    const result = await PricingService.updatePrices({ vtex, sap });

    res.json(result);
  } catch (err) {
    console.error('❌ Error actualizando precios:', err);
    res.status(500).json({ message: err.message || 'Error interno' });
  }
};