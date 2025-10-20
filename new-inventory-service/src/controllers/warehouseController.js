// src/controllers/warehouseController.js
const { getWarehouses, getWarehouseByCode } = require('../services/warehouseService');

async function getWarehousesCtrl(req, res, next) {
  try {
    const data = await getWarehouses();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getWarehouseByCodeCtrl(req, res, next) {
  try {
    const { code } = req.params;
    const warehouse = await getWarehouseByCode(code);

    if (!warehouse) {
      return res.status(404).json({ message: `Warehouse with code '${code}' not found` });
    }

    res.json(warehouse);
  } catch (err) {
    next(err);
  }
}

module.exports = { 
  getWarehousesCtrl,
  getWarehouseByCodeCtrl
};
