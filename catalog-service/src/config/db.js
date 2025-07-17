const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const pool = new sql.ConnectionPool(config);

pool.connect()
  .then(() => console.log('✅ Conectado a Catalog-Service-db'))
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

  const result = await request.query(query);

  // Si es SELECT, retorna el recordset
  if (result.recordset !== undefined) {
    return [result.recordset];
  }

  // Si es UPDATE / INSERT / DELETE, retorna el objeto completo
  return [result];
};
module.exports = pool;
