
const pool = require('../config/db');
const sql = require('mssql');

async function getListaPrecios() {
  try {
    const conn = await pool;
    const result = await conn.request()
      .query(`SELECT * FROM ITM1_ListPrice;`);
      
    //const result = await conn.request().query(``)
    return result.recordset[20000];
  } catch (error) {
    throw new Error('Error al obtener el ítem fijo: ' + error.message);
  }
}

module.exports = {
  getListaPrecios,
};
