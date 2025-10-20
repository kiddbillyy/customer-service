import express from 'express';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { startKafka } from './config/kafka.js';
import creditsRoutes from './routes/credits.js';
import transactionsRoutes from './routes/transactions.js';
import holdsRoutes from './routes/holds.js';
import { runCustomerConsumer } from './consumers/customerEventsConsumer.js';
import { runOrderConsumer } from './consumers/orderEventsConsumer.js';
import { runPaymentsConsumer} from './consumers/paymentsConsumer.js';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/credits', creditsRoutes);
app.use(transactionsRoutes); // usa /credits/:id/transactions
app.use(holdsRoutes);        // /credits/:id/holds, /holds/:holdId...

app.use((err, req, res, next) => {
  const status = err.name === 'ZodError' ? 400 : 500;
  res.status(status).json({ error: err.message, detail: err.errors ?? undefined });
});

const server = app.listen(env.PORT, () => logger.info(`customer-credit listening on :${env.PORT}`));

// arranques asíncronos
startKafka()
  .then(() => Promise.all([runCustomerConsumer(), runOrderConsumer(), runPaymentsConsumer(),]))
  .catch(err => {
    // no aborta el HTTP server si Kafka falla, pero deja log
    logger.error({ err }, 'Kafka no inició');
  });

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
