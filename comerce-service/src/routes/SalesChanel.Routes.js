//routes/SalesChanel.Routes.js
const { Router } = require('express');
const { postSalesChannel} = require('../controllers/SalesChanel.Controller');

const router = Router();

router.post('/Crear', postSalesChannel);

module.exports = router;