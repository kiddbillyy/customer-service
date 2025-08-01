// routes/index.js
const express = require('express');
const router = express.Router();

const rolesRoutes = require('./Role.Router');
const departmentsRoutes = require('./Departments.Routes');
//const plataformasRoutes = require('./Plataformas.Routes');

const modulosPlataformaRoutes = require('./ModulosPlataforma.Routes');
const submodulosRoutes = require('./SubModulos.Routes');
const endpointsApiRoutes = require('./Endpoints.Routes')
const AsignarRolRoutes = require('./UsuarioRol.Routes')

router.use('', rolesRoutes);
router.use('',AsignarRolRoutes);
router.use('/departments', departmentsRoutes);
//router.use('/plataformas', plataformasRoutes);
router.use('/modulos', modulosPlataformaRoutes);
router.use('/submodulos', submodulosRoutes);
router.use('/endpoints', endpointsApiRoutes);
module.exports = router;