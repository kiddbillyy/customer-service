const express = require("express");
const { getAll } = require("../controllers/storeController");


const router = express.Router();

// Rutas

router.get('/', getAll);


module.exports = router;
