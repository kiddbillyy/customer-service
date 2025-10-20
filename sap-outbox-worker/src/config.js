require('dotenv').config();

const bool = (v, d=false) => (v ?? '') !== '' ? String(v).toLowerCase() === 'true' : d;

const brokers = (process.env.KAFKA_BROKER || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

module.exports = {
  sql: {
    server: process.env.SQL_SERVER_HOST,
    port: Number(process.env.SQL_SERVER_PORT || 1433),
    user: process.env.SQL_SERVER_USER,
    password: process.env.SQL_SERVER_PASS,
    database: process.env.SQL_SERVER_DB,
    options: {
      encrypt: bool(process.env.SQL_ENCRYPT, false),
      trustServerCertificate: !bool(process.env.SQL_ENCRYPT, false),
      enableArithAbort: true
    },
    pool: { max: 10, min: 1, idleTimeoutMillis: 30000 }
  },
  kafka: {
    brokers,
    clientId: process.env.KAFKA_CLIENT_ID || 'sap-outbox-worker',
    topicPOCancelled: process.env.KAFKA_TOPIC_SAP_PO_CANCELLED || 'sap.purchaseorder.cancelled',
    topicPaymentReceived: process.env.KAFKA_TOPIC_SAP_PAYMENT_RECEIVED || 'payment.applied', // 👈 N
  },
  worker: {
    pollMs: Number(process.env.POLL_MS || 1000),
    batchSize: Number(process.env.BATCH_SIZE || 100),
    requeueTop: Number(process.env.REQUEUE_TOP || 50),
    maxRetry: Number(process.env.MAX_RETRY || 20)
  },
  logLevel: process.env.LOG_LEVEL || 'info'
};
