// models/orderStatusModel.js
const { IdServicePool } = require('../config/dbnew');

async function getOrderStatuses() {
  const pool = await IdServicePool;
  const result = await pool.request().query(`
    SELECT orderStatusID, statusCode
    FROM order_status
  `);
  return result.recordset;
}

module.exports = { getOrderStatuses };
