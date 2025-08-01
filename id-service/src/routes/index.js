// routes/index.js
const express = require('express');
const router = express.Router();

const rolesRoutes = require('./Role.Router');
const departmentsRoutes = require('./Departments.Routes');
const plataformasRoutes = require('./Plataformas.Routes');
const usuariosRoutes = require('./Usuario.Routes');
const authRoutes = require('./auth.Routes');

// Centralizando 
router.use('/roles', rolesRoutes);
router.use('/departments', departmentsRoutes);
router.use('/plataformas', plataformasRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/auth', authRoutes);

module.exports = router;
