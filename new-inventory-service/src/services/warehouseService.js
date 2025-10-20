// src/services/warehouseService.js
const { 
  getWarehousesDB, 
  getWarehouseByCode: getWarehouseByCodeDB 
} = require('../models/warehouseModel');

async function getWarehouses() {
  return await getWarehousesDB();
}

async function getWarehouseByCode(code) {
  return await getWarehouseByCodeDB(code);
}

module.exports = { 
  getWarehouses, 
  getWarehouseByCode 
};
