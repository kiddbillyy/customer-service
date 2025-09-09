// routes/index.js
const express = require('express');
const router = express.Router();

const VtexRoutes = require('./vtexRoutes')

router.use('/api', VtexRoutes);

module.exports = router;
