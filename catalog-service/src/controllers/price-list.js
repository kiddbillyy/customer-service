const listPriceService = require('../models/pricelistmodel');

function normalizeQuery(qr) {
  const q = Object.fromEntries(Object.entries(qr).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    page:      parseInt(q.page)      || 1,
    pageSize:  parseInt(q.pagesize)  || 100,
    itemCode:  q.itemcode ?? null,
    price: q.price !== undefined ? parseFloat(q.price) : null,
    priceIVA:  q.priceiva  !== undefined ? parseFloat(q.priceiva)  : null,
    priceList: q.pricelist !== undefined ? parseInt(q.pricelist) : null,
    minPrice:  q.minprice !== undefined ? parseFloat(q.minprice) : null,
    maxPrice:  q.maxprice !== undefined ? parseFloat(q.maxprice) : null,
    sortBy:    q.sortby || 'ItemCode',
    sortOrder: q.sortorder || 'ASC',
    _raw: q
  };
}

async function getListPrices(req, res) {
  const opts = normalizeQuery(req.query);

  // Validaciones
  if (opts.page < 1 || opts.pageSize < 1 || opts.pageSize > 500) {
    return res.status(400).json({
      message: 'Parámetros de paginación inválidos. Page y pageSize deben ser números positivos, y pageSize no puede exceder 500.'
    });
  }
  if (opts._raw.price !== undefined && isNaN(opts.price)) {
    return res.status(400).json({ message: 'El parámetro price debe ser un número válido.' });
  }
  if (opts._raw.priceiva !== undefined && isNaN(opts.priceIVA)) {
    return res.status(400).json({ message: 'El parámetro priceIVA debe ser un número válido.' });
  }
  if (opts._raw.pricelist !== undefined && isNaN(opts.priceList)) {
    return res.status(400).json({ message: 'El parámetro priceList debe ser un número válido.' });
  }
  if (opts._raw.minprice !== undefined && isNaN(opts.minPrice)) {
    return res.status(400).json({ message: 'El parámetro minPrice debe ser un número válido.' });
  }
  if (opts._raw.maxprice !== undefined && isNaN(opts.maxPrice)) {
    return res.status(400).json({ message: 'El parámetro maxPrice debe ser un número válido.' });
  }
  

  try {
    const result = await listPriceService.getListPrices(opts);
    res.json(result);
  } catch (error) {
    console.error('Error en el controlador getListPrices:', error);
    res.status(500).json({ message: error.message || 'Error interno del servidor al obtener la lista de precios.' });
  }
}

async function getListPriceById(req, res) {
  const itemCode = req.params.itemCode;
  const priceList = parseInt(req.params.priceList);

  if (!itemCode) {
    return res.status(400).json({ message: 'El parámetro ItemCode es requerido.' });
  }
  if (isNaN(priceList)) {
    return res.status(400).json({ message: 'El parámetro PriceList debe ser un número válido.' });
  }

  try {
    const listPrice = await listPriceService.getListPriceById(itemCode, priceList);
    if (listPrice) {
      res.json(listPrice);
    } else {
      res.status(404).json({ message: 'Precio de lista no encontrado para el ItemCode y PriceList proporcionados.' });
    }
  } catch (error) {
    console.error('Error en el controlador getListPriceById:', error);
    res.status(500).json({ message: error.message || 'Error interno del servidor al obtener el precio de lista por ID.' });
  }
}

module.exports = {
  getListPrices,
  getListPriceById
};
