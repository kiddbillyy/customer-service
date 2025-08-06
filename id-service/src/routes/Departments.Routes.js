const { Router } = require('express');
const { getDepartamentos, createDepartamento, updateDepartamento } = require('../controllers/Departments.Controller');


const router = Router();
router.get('/get', getDepartamentos);
router.post('/post', createDepartamento);
router.put('/put/:departamentoId', updateDepartamento);

module.exports = router;
