// routes/LocationGeo.Routes.js
const router = require('express').Router();
const ctrl = require('../controllers/LocationGeo.Controller');

// Crea vínculo
router.post('/', ctrl.createLink);

// Elimina vínculo por id
router.delete('/:id', ctrl.deleteLinkById);

// Elimina vínculo por par ?locationId=&geofenceId=
router.delete('/', ctrl.deleteLinkByPair);

// Geofences de una Location (opción coverage)
router.get('/by-location/:locationId', ctrl.getGeofencesForLocation);

// Locations de una Geofence
router.get('/by-geofence/:geofenceId', ctrl.getLocationsForGeofence);

// Listado de vínculos (filtros + paginación)
router.get('/', ctrl.listLinks);

module.exports = router;
