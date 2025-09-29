// controllers/orderStatusController.js
const { getOrderStatuses } = require('../models/orderStatus.Models');

async function listarOrderStatuses(req, res) {
  try {
    const estados = await getOrderStatuses();
    res.json(estados);
  } catch (err) {
    console.error('Error al obtener estados:', err);
    res.status(500).json({ message: 'Error interno al obtener estados' });
  }
}

module.exports = { listarOrderStatuses };