// routes/companyRoutes.js
const { Router } = require('express');
const { postStore, getStore, getStores, putStore } = require('../controllers/Store.Controller');


const router = Router();

router.get('/', getStores);
router.post('/Crear', postStore);
router.get('/:id', getStore);
router.put('/:id', putStore);

module.exports = router;
