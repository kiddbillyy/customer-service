const { getMarcas } = require('../models/MarcaModels');

function parseFilters(query) {
  return {
    page: parseInt(query.page) || 1,
    pageSize: parseInt(query.pageSize) || 50,
    code: query.code ?? null,
    name: query.name ?? null,
    fromDate: query.fromDate ?? null,
    toDate: query.toDate ?? null
  };
}

async function listMarcas(req, res) {
  try {
    const filters = parseFilters(req.query);
    const result = await getMarcas(filters);
    res.json(result);
  } catch (err) {
    console.error('❌ Error al listar marcas:', err);
    res.status(500).json({ message: 'Error al obtener las marcas.' });
  }
}

module.exports = { listMarcas };
