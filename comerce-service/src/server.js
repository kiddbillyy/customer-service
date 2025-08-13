//server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


const PORT = process.env.PORT || 5009;

app.listen(PORT, () => {
  console.log(`🚀 Comerce Service running on port ${PORT}`);
});
