// ────────────────────────────────────────────────────────────────
// src/config/db.js
// Conexión MSSQL (singleton) + helper query() estilo mysql2
// ────────────────────────────────────────────────────────────────
require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
  user    : process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server  : process.env.DB_HOST,
  database: process.env.DB_NAME,
  port    : parseInt(process.env.DB_PORT, 10),
  pool    : { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options : { encrypt: false, trustServerCertificate: true }
};

// ── poolPromise: se conecta una sola vez ────────────────────────
const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log('✅ MSSQL pool conectado');
    return pool;                       // ← instancia ConnectionPool
  })
  .catch(err => {
    console.error('❌ Error al conectar con SQL Server:', err);
    throw err;
  });

// ── query(text, params) equivalente a mysql2.query ─────────────
async function query(text, params = []) {
  const pool    = await poolPromise;   // garantiza conexión
  const request = pool.request();

  // Sustituye cada ? por @paramN y enlaza valores
  if (params.length) {
    let idx = 1;
    text = text.replace(/\?/g, () => `@param${idx++}`);
    params.forEach((p, i) => request.input(`param${i + 1}`, p));
  }

  const result = await request.query(text);
  return result.recordset !== undefined ? [result.recordset] : [result];
}

module.exports = {
  sql,          // Tipos y helpers de mssql
  poolPromise,  // Promesa que resuelve en ConnectionPool
  query         // Helper para consultas rápidas
};
