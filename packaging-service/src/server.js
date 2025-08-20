const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

// Rutas de bultos y auditoría
const bundleRoutes = require("./routes/bundlesRoutes");
const auditorRoutes = require("./routes/auditRoutes");

// Si quisieras tener consumidores Kafka en packaging, puedes crearlos e importarlos:
// const consumeMessages = require("./consumer/packagingConsumer");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Rutas de tu microservicio de Packaging
app.use("/api/bundles", bundleRoutes);
app.use("/api/audit", auditorRoutes);

// Si tuvieras un consumer Kafka para este servici, aquí lo iniciarías:
// consumeMessages();

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`🚀 Packaging Service running on port ${PORT}`);
});
