const express = require("express");
const { getAll, getAllProducts, checkAvailability} = require("../controllers/inventoryController");


const router = express.Router();

// Rutas

router.get('/', getAll);

router.get('/products', getAllProducts)


router.post('/algoritmo', checkAvailability )

module.exports = router;
