// routes/companyRoutes.js
const { Router } = require('express');
const { postStore, getStore, getStores,getStoresBasic, putStore } = require('../controllers/Store.Controller');


const router = Router();

router.get('/get', getStoresBasic);
router.get('/', getStores);
router.post('/Crear', postStore);
router.get('/:id', getStore);
router.put('/:id', putStore);

module.exports = router;
