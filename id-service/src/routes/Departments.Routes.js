const { Router } = require('express');
const { getDepartamentos, createDepartamento } = require('../controllers/Departments.Controller');


const router = Router();
router.get('/departments', getDepartamentos);
router.post('/postdepartments', createDepartamento);

module.exports = router;
