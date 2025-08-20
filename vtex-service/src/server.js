// src/server.js
const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const routes         = require('./routes');        // <-- /health, futuros endpoints
const { startScheduler } = require('./scheduler'); // <-- cron cada 2 h

const app = express();
app.use(cors());
app.use(express.json());

// monta todas las rutas bajo "/"
app.use(routes);

const PORT = process.env.PORT || 5007;

app.listen(PORT, () => {
  console.log(`🚀 VTEX-Sync service running on port ${PORT}`);
  startScheduler();               // 🔔 arranca cron cuando sube el servidor
});
