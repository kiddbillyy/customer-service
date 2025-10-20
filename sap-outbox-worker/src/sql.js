const sql = require('mssql');
const { sql: cfg } = require('./config');
const log = require('./logger');

let pool;
async function getPool() {
  if (pool?.connected) return pool;
  pool = await sql.connect({
    server: cfg.server,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    options: cfg.options,
    pool: cfg.pool
  });
  log.info({ server: cfg.server, db: cfg.database }, 'SQL connected');
  return pool;
}
module.exports = { sql, getPool };
