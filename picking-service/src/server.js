const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const pickingRoutes = require("./routes/pickingRoutes");
const bundleRoutes = require("./routes/bundlesRoutes");
const auditorRoutes = require("./routes/auditRoutes");
const consumeMessages = require("./consumer/pickingConsumer");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/picking", pickingRoutes);
app.use("/api/bundles", bundleRoutes);
app.use("/api/auditor", auditorRoutes);

// Iniciar consumidor de Kafka
consumeMessages();

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Picking Service running on port ${PORT}`);
});
