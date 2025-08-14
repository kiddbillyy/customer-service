// routes/companyRoutes.js
const { Router } = require('express');
const { postStore } = require('../controllers/Store.Controller');


const router = Router();

router.post('/Crear', postStore);

module.exports = router;
