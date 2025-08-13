// routes/endpoints-api.js
const router = require('express').Router();
const ctrl   = require('../controllers/Endpoints.Controller');

router.post('/endpoint-api', ctrl.createEndpointApi);
router.get('/getAllEndpoints',ctrl.getAllEndpoints);
router.get('/allowedEndpoints',ctrl.allowedEndpoints)
module.exports = router;