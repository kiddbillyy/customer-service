
const pool = require('../config/dbSap');
const sql = require('mssql');

async function getListaPrecios() {
  try {
    const conn = await pool;
    const result = await conn.request()
      .query(`SELECT * FROM ITM1;`);
      
    //const result = await conn.request().query(``)
    return result.recordset[0];
  } catch (error) {
    throw new Error('Error al obtener el ítem fijo: ' + error.message);
  }
}

module.exports = {
  getListaPrecios,
};
