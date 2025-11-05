import express from 'express';
import morgan from 'morgan';
import { env } from './config/env.js';
import webhookRoutes from './routes/webhook.routes.js';


const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.LOG_LEVEL === 'debug' ? 'dev' : 'tiny'));


// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));


// Rutas
app.use(webhookRoutes);


app.listen(env.PORT, () => {
console.log(`ML Webhook listening on http://0.0.0.0:${env.PORT}`);
});