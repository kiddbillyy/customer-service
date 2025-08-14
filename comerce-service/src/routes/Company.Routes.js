// routes/companyRoutes.js
const { Router } = require('express');
const { postCompany, getCompany, listCompanies, putCompany  } = require('../controllers/Company.Controller');

const router = Router();

router.post('/Crear', postCompany);
router.get('/', listCompanies);
router.get('/:idOrRef', getCompany);
router.put('/:id', putCompany);

module.exports = router;
