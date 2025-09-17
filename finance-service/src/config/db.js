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


const FinanceServicePool = new sql.ConnectionPool(omsConfig);
const FinanceServicePoolConnect = FinanceServicePool.connect()
  .then(() => console.log('✅ Conectado a FINANCE-SERVICE (OMS) DB'))
  .catch(err => console.error('❌ Error conectando a FINANCE-SERVICE DB:', err));

module.exports = { sql, FinanceServicePool, FinanceServicePoolConnect };

