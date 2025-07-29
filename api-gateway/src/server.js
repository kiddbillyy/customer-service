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

// 🚫 Caso A: SIN proxy/LB delante ⇒ NO confiar en proxies
app.set('trust proxy', false); // también puedes borrar esta línea; por defecto es false

// Middlewares base
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(logger);

// 📌 Importante: parsear body ANTES de montar proxies
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limit (sin trustProxy)
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
