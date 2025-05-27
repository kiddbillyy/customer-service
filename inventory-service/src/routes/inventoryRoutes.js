const express = require("express");
const { getAll, getAllProducts} = require("../controllers/inventoryController");


const router = express.Router();

// Rutas

router.get('/', getAll);

router.get('/products', getAllProducts)


module.exports = router;
