const ordersModel = require('../models/OrdersModel');

function normalizeQuery(q = {}) {
  const m = Object.fromEntries(Object.entries(q).map(([k,v]) => [k.toLowerCase(), v]));
  return {
    page:      parseInt(m.page)      || 1,
    pageSize:  parseInt(m.pagesize)  || 50,
    sortBy:    (m.sortby || 'createDate'),
    sortOrder: (m.sortorder || 'DESC').toUpperCase(),
    _raw: m
  };
}

async function getOrders(req, res) {
  const opts = normalizeQuery(req.query);
  if (opts.page < 1 || opts.pageSize < 1 || opts.pageSize > 200) {
    return res.status(400).json({ message: 'Paginación inválida: page ≥ 1, 1 ≤ pageSize ≤ 200.' });
  }
  try {
    const out = await ordersModel.getOrders(opts);
    res.json(out);
  } catch (e) {
    console.error('getOrders error:', e);
    res.status(500).json({ message: e.message || 'Error interno al obtener pedidos.' });
  }
}

async function getOrderById(req, res) {
  const orderId = req.params.orderId;
  if (!orderId) return res.status(400).json({ message: 'orderId requerido.' });
  try {
    const out = await ordersModel.getOrderById(orderId);
    if (!out) return res.status(404).json({ message: 'Pedido no encontrado.' });
    res.json(out);
  } catch (e) {
    console.error('getOrderById error:', e);
    res.status(500).json({ message: e.message || 'Error interno al obtener el pedido.' });
  }
}

module.exports = { getOrders, getOrderById };
