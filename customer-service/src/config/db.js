import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  server: process.env.SQL_SERVER_HOST,
  port: Number(process.env.SQL_SERVER_PORT || 1433),
  user: process.env.SQL_SERVER_USER,
  password: process.env.SQL_SERVER_PASS,
  database: process.env.SQL_SERVER_DB,
  options: {
    encrypt: String(process.env.SQL_ENCRYPT || 'false').toLowerCase() === 'true',
    trustServerCertificate: true
  },
  pool: { max: 20, min: 0, idleTimeoutMillis: 30000 }
};

let pool;
export async function getPool() {
  if (pool?.connected) return pool;
  pool = await sql.connect(config);
  return pool;
}
export { sql };
