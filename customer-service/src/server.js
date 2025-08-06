//server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

const testEmail = require('./routes/testEmail')
const { runConsumer } = require('./utils/kafkaConsumer');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/email', testEmail);

const PORT = process.env.PORT || 5008;

app.listen(PORT, () => {
  console.log(`🚀 EMAIL Service running on port ${PORT}`);
  runConsumer();
});
