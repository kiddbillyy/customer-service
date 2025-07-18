
const { getListaPrecios } = require('../models/pricelistmodel');

async function obtenerListaDePrecios(req, res) {
  try {
    const item = await getListaPrecios();

    if (!item) {
      return res.status(404).json({ message: 'Item no encontrado' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error en el controlador:', error);
    res.status(500).json({ message: 'Error al obtener el ítem fijo' });
  }
}

module.exports = { obtenerListaDePrecios };