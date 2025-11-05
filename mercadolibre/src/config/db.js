// src/config/db.js
import sql from 'mssql';

let pool;
export async function getPool() {
  if (!pool) {
    pool = await sql.connect({
      server: process.env.SQL_HOST,                 // host.docker.internal
      port: Number(process.env.SQL_PORT || 1433),   // <— PUERTO
      user: process.env.SQL_USER,
      password: process.env.SQL_PASS,
      database: process.env.SQL_DB,
      options: {
        trustServerCertificate: true,
        enableArithAbort: true
      }
    });
  }
  return pool;
}
export { sql };
