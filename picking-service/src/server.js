const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const pickingRoutes = require("./routes/pickingRoutes");
const waveRoutes = require("./routes/waveRoutes");
const consumeMessages = require("./consumer/pickingConsumer");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


// Rutas Picking
app.use("/api/picking", pickingRoutes);

// Rutas de olas y rondas
app.use("/api/picking", waveRoutes);


// Iniciar consumidor de Kafka
consumeMessages();

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Picking Service running on port ${PORT}`);
});
