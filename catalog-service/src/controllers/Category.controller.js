const { buscarCategorias } = require('../models/CategoryModels');

// Controller: recibe la petición HTTP
const obtenerCategorias = async (req, res) => {
  try {
    const { buscar } = req.query;
    const categorias = await buscarCategorias(buscar);

    res.status(200).json(categorias);
  } catch (error) {
    console.error('❌ Error al obtener categorías:', error);
    res.status(500).json({ error: 'Error al obtener las categorías' });
  }
};

module.exports = { obtenerCategorias };
