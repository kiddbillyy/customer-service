// dbnewsap.js
const sql = require('mssql');
require('dotenv').config();

const sapConfig = {
  user: process.env.SAP_DB_USER,
  password: process.env.SAP_DB_PASSWORD,
  server: process.env.SAP_DB_HOST,
  database: process.env.SAP_DB_NAME,
  port: parseInt(process.env.SAP_DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const sapPool = new sql.ConnectionPool(sapConfig);
const sapPoolConnect = sapPool.connect()
  .then(() => console.log('✅ Conectado a SAP DB'))
  .catch(err => console.error('❌ Error conectando a SAP DB:', err));

module.exports = { sql, sapPool, sapPoolConnect };
