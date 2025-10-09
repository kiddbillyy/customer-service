/* import morgan from 'morgan';
export default morgan('combined'); */


// src/middlewares/logger.js
import winston from 'winston';
import { v4 as uuid } from 'uuid';
import { AsyncLocalStorage } from 'node:async_hooks';
import morgan from 'morgan';

const als = new AsyncLocalStorage();

// --- Winston base (JSON a stdout) ---
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    // adjunta requestId si existe
    winston.format((info) => {
      const store = als.getStore();
      if (store?.requestId) info.requestId = store.requestId;
      return info;
    })(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// --- Middleware: contexto y request-id ---
export function withRequestContext(req, _res, next) {
  const requestId = req.headers['x-request-id'] || uuid();
  req.id = requestId;
  als.run({ requestId }, () => next());
}

// --- Access logs (Morgan → Winston) ---
const accessStream = { write: (msg) => logger.info(msg.trim(), { type: 'access' }) };

// Formato corto, sin PII y sin auth header
export const httpLogger = morgan(
  ':remote-addr :method :url :status :res[content-length] - :response-time ms',
  {
    stream: accessStream,
    skip: (req) => req.url === '/health' || req.url === '/metrics',
  }
);

// Helper para crear hijos con metadatos (útil en servicios externos)
export const child = (meta = {}) => logger.child(meta);

export default logger;
