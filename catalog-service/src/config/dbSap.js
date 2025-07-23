//dbSap.js
const sql = require('mssql');
require('dotenv').config();

const sapConfig = {
  user: process.env.SAP_DB_USER,
  password: process.env.SAP_DB_PASSWORD,
  server: process.env.SAP_DB_HOST,
  database: process.env.SAP_DB_NAME,
  port: parseInt(process.env.SAP_DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};


const pool = new sql.ConnectionPool(sapConfig);

pool.connect()
  .then(() => console.log('✅ Conectado a SQL Server'))
  .catch(err => console.error('❌ Error al conectar con SQL Server:', err));

// Wrapper para mantener interfaz similar a mysql2
pool.query = async (query, params) => {
  const request = pool.request();

  if (params && Array.isArray(params)) {
    let paramIndex = 1;
    query = query.replace(/\?/g, () => `@param${paramIndex++}`);
    params.forEach((param, i) => {
      request.input(`param${i + 1}`, param);
    });
  }
  //console.log("Query: ", query)
  const result = await request.query(query);
  //console.log("Result: ",result)

  // Si es SELECT, retorna el recordset
/*   if (result.recordset !== undefined) {
    return [result.recordset];
  }

  // Si es UPDATE / INSERT / DELETE, retorna el objeto completo
  return [result]; */
};
module.exports = pool;
