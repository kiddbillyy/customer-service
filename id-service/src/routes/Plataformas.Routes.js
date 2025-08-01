const { Router } = require('express');
const { crearPlataforma } = require('../controllers/Plataformas.Controller');

const router = Router();
router.post('/', crearPlataforma);

module.exports = router;
