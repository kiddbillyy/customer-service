import express from 'express';
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
server.keepAliveTimeout = 70_000;  // igual a upstream
server.headersTimeout   = 75_000;  // > keepAliveTimeout
