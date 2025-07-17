
const pool = require('../config/dbSap');
const sql = require('mssql');

async function getItemFijo() {
  try {
    const conn = await pool;
    const result = await conn.request()
      .query(`SELECT * FROM OITM WHERE ItemCode = '001001016'`);

    return result.recordset[0]; // solo el primer resultado
  } catch (error) {
    throw new Error('Error al obtener el ítem fijo: ' + error.message);
  }
}

module.exports = {
  getItemFijo,
};
