// routes/Geofences.Routes.js
const router = require('express').Router();
const ctrl = require('../controllers/GeofencesController');

// Crea una geofence
router.post('/', ctrl.createGeofence);

// Actualiza una geofence
router.put('/:id', ctrl.updateGeofence);

// Obtiene una geofence por id
router.get('/:id', ctrl.getGeofenceById);

// Lista todas
router.get('/', ctrl.listGeofences);

module.exports = router;
