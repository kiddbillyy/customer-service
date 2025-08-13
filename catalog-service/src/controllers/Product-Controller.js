const productService = require('../models/ProductsModel');

function normalizeQuery(qr) {
  const q = Object.fromEntries(
    Object.entries(qr).map(([k, v]) => [k.toLowerCase(), v])
  );

  return {
    page:     parseInt(q.page)     || 1,
    pageSize: parseInt(q.pagesize) || 100,
    itemCode: q.itemcode ?? null,
    name:     q.name ?? null,
    category: q.category ?? null,
    barcode:  q.barcode ?? null,
    brand:    q.brand ?? null,
    sortBy:    q.sortby   || 'ItemCode',
    sortOrder: q.sortorder || 'ASC',

    _raw: q
  };
}

// GET /products

async function getProducts(req, res) {
  const opts = normalizeQuery(req.query);

  // Validaciones básicas
  if (opts.page < 1 || opts.pageSize < 1 || opts.pageSize > 500) {
    return res.status(400).json({
      message: 'Parámetros de paginación inválidos. page y pageSize deben ser positivos, y pageSize ≤ 500.'
    });
  }

  try {
    const result = await productService.getProducts(opts);
    res.json(result);
  } catch (error) {
    console.error('Error en getProducts:', error);
    res.status(500).json({
      message: error.message || 'Error interno del servidor al obtener productos.'
    });
  }
}

// GET /products/:itemCode

async function getProductBySku(req, res) {
  const itemCode = req.params.itemCode;
  if (!itemCode) {
    return res.status(400).json({ message: 'El parámetro itemCode es requerido.' });
  }

  try {
    const product = await productService.getProductBySku(itemCode);
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ message: 'Producto no encontrado.' });
    }
  } catch (error) {
    console.error('Error en getProductBySku:', error);
    res.status(500).json({
      message: error.message || 'Error interno del servidor al obtener el producto.'
    });
  }
}

module.exports = {
  getProducts,
  getProductBySku
};
