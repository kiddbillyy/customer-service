//server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

const apiRoutes = require('./routes/index')

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/idservice', apiRoutes);

const PORT = process.env.PORT || 5007;

app.listen(PORT, () => {
  console.log(`🚀 ID Service running on port ${PORT}`);
});
