//routes/SalesChanel.Routes.js
const { Router } = require('express');
const { postSalesChannel, getSalesChannels, getSalesChannel, putSalesChannel, postSalesChannelsBulk } = require('../controllers/SalesChanel.Controller');

const router = Router();

router.get('/Listar', getSalesChannels);
router.get('/:id', getSalesChannel);
router.post('/Crear', postSalesChannel);
router.post('/massive', postSalesChannelsBulk);
router.put('/:id', putSalesChannel);

module.exports = router;