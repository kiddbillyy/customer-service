const priceListService = require('../models/ListPriceModel');

// ───────── helpers ─────────
function normalizeQuery(qr = {}) {
  const q = Object.fromEntries(Object.entries(qr).map(([k, v]) => [k.toLowerCase(), v]));

  // Fechas: acepta ISO (yyyy‑mm‑dd) o timestamp numérico
  const parseDate = (d) => {
    if (d === undefined) return null;
    const num = Number(d);
    return isNaN(num) ? new Date(d) : new Date(num);
  };

  return {
    page:        parseInt(q.page)       || 1,
    pageSize:    parseInt(q.pagesize)   || 100,

    listNum:     q.listnum  !== undefined ? parseInt(q.listnum)  : null,
    listName:    q.listname ?? null,
    groupCode:   q.groupcode !== undefined ? parseInt(q.groupcode) : null,
    validFor:    q.validfor ?? null,    // 'Y' | 'N' | null
    validFrom:   parseDate(q.validfrom),
    validTo:     parseDate(q.validto),

    sortBy:      q.sortby   || 'ListNum',
    sortOrder:   q.sortorder || 'ASC',

    _raw: q
  };
}

// ───────── controllers ─────────
async function getPriceLists(req, res) {
  const opts = normalizeQuery(req.query);

  // Validaciones básicas
  if (opts.page < 1 || opts.pageSize < 1 || opts.pageSize > 500) {
    return res.status(400).json({
      message: 'Parámetros de paginación inválidos: page ≥ 1, 1 ≤ pageSize ≤ 500.'
    });
  }
  if (opts._raw.listnum !== undefined && isNaN(opts.listNum)) {
    return res.status(400).json({ message: 'listNum debe ser un número entero.' });
  }
  if (opts._raw.groupcode !== undefined && isNaN(opts.groupCode)) {
    return res.status(400).json({ message: 'groupCode debe ser un número entero.' });
  }
  if (opts.validFor && !['Y', 'N'].includes(String(opts.validFor).toUpperCase())) {
    return res.status(400).json({ message: "validFor solo puede ser 'Y' o 'N'." });
  }
  if (opts.validFrom && isNaN(opts.validFrom.valueOf())) {
    return res.status(400).json({ message: 'validFrom debe ser una fecha válida.' });
  }
  if (opts.validTo && isNaN(opts.validTo.valueOf())) {
    return res.status(400).json({ message: 'validTo debe ser una fecha válida.' });
  }

  try {
    const result = await priceListService.getPriceLists(opts);
    res.json(result);
  } catch (error) {
    console.error('Error en getPriceLists:', error);
    res.status(500).json({ message: error.message || 'Error interno del servidor.' });
  }
}

async function getPriceListById(req, res) {
  const listNum = parseInt(req.params.listNum);

  if (isNaN(listNum)) {
    return res.status(400).json({ message: 'listNum debe ser un número entero.' });
  }

  try {
    const priceList = await priceListService.getPriceListById(listNum);
    if (priceList) {
      res.json(priceList);
    } else {
      res.status(404).json({ message: 'Price list no encontrado.' });
    }
  } catch (error) {
    console.error('Error en getPriceListById:', error);
    res.status(500).json({ message: error.message || 'Error interno del servidor.' });
  }
}

module.exports = { getPriceLists, getPriceListById };
