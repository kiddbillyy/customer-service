const { Router } = require('express');
const { crearPlataforma, listarPlataformas, editarPlataforma  } = require('../controllers/Plataformas.Controller');

const router = Router();
router.post('/', crearPlataforma);
router.get('/obtener', listarPlataformas);
router.put('/editar/:id', editarPlataforma);

module.exports = router;
