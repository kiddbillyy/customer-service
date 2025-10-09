// src/controllers/seller.controller.js
const { querySellers, querySellerStatuses, getSellerByRut } = require('../models/seller.Models');
const { toRutPlain } = require('../utils/rut'); 

async function getSellers(req, res) {
  try {
    const {
      q,
      statusIds,
      statusNames,
      page = 1,
      pageSize = 20,
      orderBy = 'createdAt',
      orderDir = 'desc',
    } = req.query;

    const { total, rows, page: safePage, pageSize: size, offset } = await querySellers({
      q,
      statusIds,
      statusNames,
      page,
      pageSize,
      orderBy,
      orderDir,
    });

    const items = rows.map(r => ({
      id: r.ID,
      created: r.FECHA_CREACION ? new Date(r.FECHA_CREACION).toISOString() : null,
      name: r.NOMBRE_COMPLETO || null,
      email: r.EMAIL || null,
      phone: r.TELEFONO || null,
      personalId: r.RUT || null,
      externalIds: { sap: r.EXTERNAL_SAP_ID || null },
      modifiedByUser: null, // por ahora null
      status: r.STATUS_NOMBRE || null,
    }));

    res.json({
      page: safePage,
      pageSize: size,
      total,
      hasNextPage: offset + items.length < total,
      items,
    });
  } catch (err) {
    console.error('Error getSellers:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

async function getSellerStatuses(req, res) {
  try {
    const items = await querySellerStatuses();
    res.json({ items });
  } catch (err) {
    console.error('Error getSellerStatuses:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

async function getSellerByRutController(req, res) {
  try {
    const rutInput = req.params.rut || req.query.rut; 
    const rutPlain = toRutPlain(rutInput);

    if (!rutPlain) {
      return res.status(400).json({ error: 'RUT inválido.' });
    }

    const row = await getSellerByRut(rutPlain);
    if (!row) {
      return res.status(404).json({ error: 'Seller no encontrado.' });
    }

    return res.json({
      name: row.name || null,
      external_sap_id: row.external_sap_id || null,
      status: row.status || null,
    });
  } catch (err) {
    console.error('Error getSellerByRutController:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

module.exports = {
  getSellers,
  getSellerStatuses,
  getSellerByRutController
};
