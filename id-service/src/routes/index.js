// routes/index.js
const express = require('express');
const router = express.Router();

const rolesRoutes = require('./Role.Router');
const departmentsRoutes = require('./Departments.Routes');

const modulosPlataformaRoutes = require('./ModulosPlataforma.Routes');
const submodulosRoutes = require('./SubModulos.Routes');
const endpointsApiRoutes = require('./Endpoints.Routes')
const AsignarRolRoutes = require('./UsuarioRol.Routes')

const plataformasRoutes = require('./Plataformas.Routes');
const usuariosRoutes = require('./Usuario.Routes');
const authRoutes = require('./auth.Routes');
const PerfilesRoutes = require('./Perfiles.Routes');

router.use('', rolesRoutes);
router.use('', AsignarRolRoutes);
router.use('/modulos', modulosPlataformaRoutes);
router.use('/submodulos', submodulosRoutes);
router.use('/endpoints', endpointsApiRoutes);

router.use('/departments', departmentsRoutes);
router.use('/plataformas', plataformasRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/auth', authRoutes);
router.use('/perfiles', PerfilesRoutes);

module.exports = router;

