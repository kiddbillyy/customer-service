//routes/account.Routes.js
const { Router } = require('express');
const { postAccount, getAccount, getList, putAccount, postAccountsBulk, getAccountFeatures } = require('../controllers/Account.Controller');
const router = Router();

router.post('/Crear', postAccount);
router.post('/massive', postAccountsBulk);
router.get('/Listar', getList);
router.get('/features/:id', getAccountFeatures);
router.get('/:id', getAccount);
router.put('/:id', putAccount);

module.exports = router;
// This route handles the creation of an account with optional credentials.