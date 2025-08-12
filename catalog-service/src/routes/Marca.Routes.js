const express = require('express');
const router = express.Router();
const { listMarcas } = require('../controllers/MarcaModels');

router.get('/getmarca', listMarcas);

module.exports = router;
