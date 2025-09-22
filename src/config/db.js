import sql from 'mssql';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const config = {
  server: env.SQL_SERVER_HOST,
  port: env.SQL_SERVER_PORT,
  user: env.SQL_SERVER_USER,
  password: env.SQL_SERVER_PASS,
  database: env.SQL_SERVER_DB,
  options: { encrypt: env.SQL_ENCRYPT, trustServerCertificate: !env.SQL_ENCRYPT },
  pool: { min: 1, max: 10, idleTimeoutMillis: 30000 }
};

let poolPromise;

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then(pool => {
        logger.info({ db: env.SQL_SERVER_DB }, 'MSSQL pool conectado');
        return pool;
      })
      .catch(err => {
        logger.error({ err }, 'Error conectando a MSSQL');
        throw err;
      });
  }
  return poolPromise;
}

export { sql };
