// routes/Locations.Routes.js
const router = require('express').Router();
const ctrl = require('../controllers/Location.Controller');

// Crea una Location
router.post('/', ctrl.createLocation);

// Actualiza una Location
router.put('/:id', ctrl.updateLocation);

// Obtiene una Location por id
router.get('/:id', ctrl.getLocationById);

// Lista Locations (filtros: storeId, active, q; paginación: page, pageSize)
router.get('/', ctrl.listLocations);

module.exports = router;
