import sql from 'mssql';

let pool;

export async function connectPool() {
  if (pool) return pool;
  pool = await sql.connect({
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    options: { trustServerCertificate: true, enableArithAbort: true }
  });
  console.log('[DB] Connected to', process.env.DB_NAME);
  return pool;
}

export function getPool() {
  if (!pool) throw new Error('DB pool not initialized');
  return pool;
}

// 👇 agrega esto
export async function closePool() {
  if (pool) {
    await pool.close();
    console.log('[DB] Connection pool closed');
    pool = null;
  }
}

export { sql };
