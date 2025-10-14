/* import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import services from './config/services.js';
import { makeRoute } from './proxy/routeFactory.js';
import logger from './middlewares/logger.js';
import rateLimiter from './middlewares/rateLimiter.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

app.set('trust proxy', false);

// Middlewares base (NO parsee el body aquí)
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(logger);

// Log de entrada (útil para depurar)
app.use((req, _res, next) => {
  const ct = req.headers['content-type'] || '';
  const cl = req.headers['content-length'] || 'N/A';
  console.log('[GW-IN]', req.method, req.originalUrl, 'CT=', ct, 'CL=', cl);
  next();
});

// Rate limit antes de los proxies (ok)
app.use(rateLimiter);

// 👉 Monta dinámicamente cada ruta-proxy **ANTES** de parsear body
Object.values(services).forEach((cfg) => {
  const { mountPoint, handler } = makeRoute(cfg);
  app.use(mountPoint, handler);
});

// (Opcional) Si el Gateway tiene endpoints PROPIOS que necesitan body parser, colócalos DESPUÉS:
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.send('OK'));

// Error final
app.use(errorHandler);


const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`🚀 API Gateway on ${PORT}`));
server.keepAliveTimeout = 65_000;  // igual a upstream
server.headersTimeout   = 70_000;  // > keepAliveTimeout
 */

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import services from './config/services.js';
import { makeRoute } from './proxy/routeFactory.js';
import { logger, withRequestContext, httpLogger } from './middlewares/logger.js';
import rateLimiter from './middlewares/rateLimiter.js';
import errorHandler from './middlewares/errorHandler.js';
import { httpDuration, metricsEndpoint } from './metrics.js';

const app = express();
app.set('trust proxy', false);

// Contexto y seguridad base
app.use(withRequestContext);
app.use(cors());
app.use(helmet());
app.use(compression());

// Access logs (no PII)
app.use(httpLogger);

// Latencia por ruta (métrica)
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const dur = Number(process.hrtime.bigint() - start) / 1e9;
    // route puede ser undefined si es proxy → usa originalUrl
    const route = req.route?.path || req.originalUrl || 'N/A';
    httpDuration.labels(req.method, route, String(res.statusCode)).observe(dur);
  });
  next();
});

// Añade el requestId a la respuesta (útil para correlación)
app.use((req, res, next) => {
  if (req.id) res.setHeader('X-Request-Id', req.id);
  next();
});

// Endpoint health y métricas (idealmente expón /metrics solo en red interna)
app.get('/health', (_req, res) => res.send('OK'));
app.get('/metrics', metricsEndpoint());

// Rate limit antes de los proxies
app.use(rateLimiter);

// Monta proxies ANTES del body parser
Object.values(services).forEach((cfg) => {
  const { mountPoint, handler } = makeRoute(cfg);
  app.use(mountPoint, handler);
});

// Body parser solo para endpoints propios
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Error final
app.use(errorHandler);

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => logger.info('🚀 API Gateway on', { port: PORT }));

// timeouts del server
/* server.keepAliveTimeout = 65_000;
server.headersTimeout   = 70_000;
 */