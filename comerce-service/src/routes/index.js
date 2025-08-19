// routes/index.js
const express = require('express');
const router = express.Router();
const geofencesRoutes = require('./Geofences.Routes');
const companyRoutes = require('./Company.Routes');
const storeRoutes = require('./Store.Routes');
const locationRoutes = require('./Location.Routes') 
const salesChannelRoutes = require('./SalesChanel.Routes');
const accountRoutes = require('./account.Routes');


router.use('/geofences', geofencesRoutes);
router.use('/company', companyRoutes);
router.use('/store', storeRoutes);
router.use('/locations',locationRoutes)
router.use('/sales-channel', salesChannelRoutes);
router.use('/account', accountRoutes);


module.exports = router;
