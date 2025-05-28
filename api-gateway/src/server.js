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
app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(logger);
app.use(rateLimiter);

// Monta dinámicamente cada ruta-proxy
Object.values(services).forEach((cfg) => {
  const { mountPoint, handler } = makeRoute(cfg);
  app.use(mountPoint, handler);
});

app.get('/health', (_req, res) => res.send('OK'));

// Error final
app.use(errorHandler);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 API Gateway on ${PORT}`));
