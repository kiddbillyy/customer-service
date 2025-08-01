const { Router } = require('express');
const { getDepartamentos, createDepartamento } = require('../controllers/Departments.Controller');


const router = Router();
router.get('/get', getDepartamentos);
router.post('/post', createDepartamento);

module.exports = router;
