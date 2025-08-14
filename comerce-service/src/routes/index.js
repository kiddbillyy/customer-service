// routes/index.js
const express = require('express');
const router = express.Router();

// ... tus otros requires existentes ...
const geofencesRoutes = require('./Geofences.Routes');

// ... tus otros router.use existentes ...
router.use('/geofences', geofencesRoutes);

module.exports = router;
