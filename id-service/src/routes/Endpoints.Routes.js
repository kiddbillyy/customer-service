// routes/endpoints-api.js
const router = require('express').Router();
const ctrl   = require('../controllers/Endpoints.Controller');

router.post('/endpoint-api', ctrl.createEndpointApi);

module.exports = router;