// conexión DIRECTA a la company-DB de SAP (no Service Layer)
const sql = require('mssql');
require('dotenv').config();

const cfg = {
  user    : process.env.SAP_DB_USER,
  password: process.env.SAP_DB_PASSWORD,
  server  : process.env.SAP_DB_HOST,
  database: process.env.SAP_DB_NAME,
  port    : Number(process.env.SAP_DB_PORT || 1433),
  options : { encrypt: false, trustServerCertificate: true },
  pool    : { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const sapPool        = new sql.ConnectionPool(cfg);
const sapPoolConnect = sapPool.connect()
  .then(() => console.log('✅ Conectado a SAP DB'))
  .catch(err => console.error('❌ Error conexión SAP DB:', err));

module.exports = { sql, sapPool, sapPoolConnect };
