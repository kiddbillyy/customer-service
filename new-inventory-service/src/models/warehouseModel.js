// src/models/warehouseModel.js
const { getPool } = require('../config/db');

async function getWarehousesDB() {
  const pool = await getPool();
  const q = `
    SELECT *
    FROM dbo.Warehouses
    ORDER BY code asc;
  `;
  const { recordset } = await pool.request().query(q);
  return recordset;
}
async function getWarehouseByCode(code) {
  const pool = await getPool();
  const q = `
    SELECT *
    FROM dbo.Warehouses
    WHERE code = @code;
  `;
  const { recordset } = await pool.request()
    .input('code', code)
    .query(q);
  return recordset[0]; // Devuelve un solo registro
}

module.exports = { 
  getWarehousesDB,
  getWarehouseByCode
};