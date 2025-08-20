// conexión a la BD de staging VTEX_SYNC
const sql = require('mssql');
require('dotenv').config();

const cfg = {
  user    : process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server  : process.env.DB_HOST,
  database: process.env.DB_NAME,
  port    : Number(process.env.DB_PORT || 1433),
  options : { encrypt: false, trustServerCertificate: true },
  pool    : { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const catalogPool        = new sql.ConnectionPool(cfg);
const catalogPoolConnect = catalogPool.connect()
  .then(() => console.log('✅ Conectado a VTEX_SYNC DB'))
  .catch(err => console.error('❌ Error conexión VTEX_SYNC DB:', err));

module.exports = { sql, catalogPool, catalogPoolConnect };
