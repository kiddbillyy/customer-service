const barcodeService = require('../models/BarcodeModesl');

function normalizeQuery(qr) {
  const q = Object.fromEntries(Object.entries(qr || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    page:      parseInt(q.page)      || 1,
    pageSize:  parseInt(q.pagesize)  || 100,
    itemCode:  q.itemcode ?? null,           // si viene, se ignora paginación
    sortBy:    q.sortby    || 'ItemCode',    // 'ItemCode' | 'UpdateDate'
    sortOrder: q.sortorder || 'ASC',
    _raw: q
  };
}

// GET /v1/barcodes
async function listBarcodes(req, res) {
  const opts = normalizeQuery(req.query);

  // Validación de paginación (solo aplica cuando NO hay itemCode)
  if (!opts.itemCode) {
    if (opts.page < 1 || opts.pageSize < 1 || opts.pageSize > 1000) {
      return res.status(400).json({ message: 'Paginación inválida: page ≥ 1, 1 ≤ pageSize ≤ 1000.' });
    }
  }

  try {
    const result = await barcodeService.listBarcodes(opts);
    res.json(result);
  } catch (err) {
    console.error('Error en listBarcodes:', err);
    res.status(500).json({ message: err.message || 'Error interno al listar barcodes.' });
  }
}

// GET /v1/barcodes/:itemCode
async function getBarcodesByItemCode(req, res) {
  const itemCode = req.params.itemCode;
  if (!itemCode) return res.status(400).json({ message: 'El parámetro itemCode es requerido.' });

  try {
    const result = await barcodeService.getBarcodesByItemCode(itemCode);
    // Como devuelve forma de "list", simplificamos si solo esperamos 1 SKU
    const row = result.data.find(d => d.ItemCode === itemCode) || result.data[0] || null;
    if (!row) return res.status(404).json({ message: 'Producto no encontrado.' });
    res.json(row);
  } catch (err) {
    console.error('Error en getBarcodesByItemCode:', err);
    res.status(500).json({ message: err.message || 'Error interno al obtener barcodes del producto.' });
  }
}

module.exports = {
  listBarcodes,
  getBarcodesByItemCode
};
