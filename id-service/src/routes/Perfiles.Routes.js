const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer');
const usuarioController = require('../controllers/Perfiles.Controller');
const { obtenerPerfilPorUsuarioId, subirImagenPerfil } = require('../controllers/Perfiles.Controller');

router.put('/editar/:id', usuarioController.editarPerfil);
router.get('/:usuarioId', obtenerPerfilPorUsuarioId);
router.put('/subir-imagen/:usuarioId', upload.single('imagen'), subirImagenPerfil);

module.exports = router;
