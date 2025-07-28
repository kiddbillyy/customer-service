const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());



const PORT = process.env.PORT || 5007;

app.listen(PORT, async () => {
  await connectProducer(); 
  console.log(`🚀 ID Service running on port ${PORT}`);
});
