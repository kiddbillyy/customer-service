// src/server.js
const express = require('express');
const cors = require('cors');
const { port } = require('./config');
const { startScheduler } = require('./services/sapSchedulerService');
const schedulerRoutes = require('./routes/schedulerRoutes');
const vtexRoutes   = require('./routes/vtexRoutes');
const app = express();
app.use(cors());
app.use(express.json());

// Rutas de la API
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/vtex', vtexRoutes)

// Iniciar el cron job (cada 10 minutos)
startScheduler();

app.listen(port, () => {
  console.log(`🚀 SAP Scheduler Service corriendo en el puerto ${port}`);
});
