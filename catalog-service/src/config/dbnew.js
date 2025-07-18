// db.js
const sql = require('mssql');
require('dotenv').config();

const omsConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const catalogPool = new sql.ConnectionPool(omsConfig);
const catalogPoolConnect = catalogPool.connect()
  .then(() => console.log('✅ Conectado a Catalog (OMS) DB'))
  .catch(err => console.error('❌ Error conectando a OMS DB:', err));

module.exports = { sql, catalogPool, catalogPoolConnect };
