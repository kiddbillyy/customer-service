// routes/index.js
const express = require('express');
const router = express.Router();
const geofencesRoutes = require('./Geofences.Routes');
const companyRoutes = require('./Company.Routes');
const storeRoutes = require('./Store.Routes');
const locationRoutes = require('./Location.Routes') 
const salesChannelRoutes = require('./SalesChanel.Routes');
const locationGeoRoutes = require('./LocationGeo.Routes');
const holidaysRoutes = require('./Holiday.Routes');


router.use('/geofences', geofencesRoutes);
router.use('/company', companyRoutes);
router.use('/store', storeRoutes);
router.use('/locations',locationRoutes)
router.use('/sales-channel', salesChannelRoutes);
router.use('/location-geo',locationGeoRoutes);
router.use('/holidays',holidaysRoutes);


module.exports = router;
