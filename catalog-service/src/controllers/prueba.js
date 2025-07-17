
const { getItemFijo } = require('../models/prueba');

async function obtenerItemFijo(req, res) {
  try {
    const item = await getItemFijo();

    if (!item) {
      return res.status(404).json({ message: 'Item no encontrado' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error en el controlador:', error);
    res.status(500).json({ message: 'Error al obtener el ítem fijo' });
  }
}

module.exports = { obtenerItemFijo };