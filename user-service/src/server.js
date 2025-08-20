const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
// const consumeMessages = require('./consumer/userConsumer');  // Si usaras Kafka
const errorHandler = require('./middleware/errorHandler'); // Si lo deseas

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Iniciar consumer de Kafka, si lo deseas:
// consumeMessages();

// Middleware de errores (opcional)
app.use(errorHandler);

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`🚀 User/Auth Service running on port ${PORT}`);
});