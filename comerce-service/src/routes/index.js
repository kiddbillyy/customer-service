// routes/index.js
const express = require('express');
const router = express.Router();

const companyRoutes = require('./Company.Routes');
const storeRoutes = require('./Store.Routes');

router.use('/company', companyRoutes);
router.use('/store', storeRoutes);



module.exports = router;

