require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5004,
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  kafka: {
    clientId: process.env.KAFKA_CLIENT_ID || 'sap-integration-service',
    brokers: [process.env.KAFKA_BROKER]
  },
  endpoints: {
    ordersService: process.env.ORDERS_SERVICE_URL,
    sap: process.env.SAP_ENDPOINT,
    retail: process.env.RETAIL_ENDPOINT
  }
};
