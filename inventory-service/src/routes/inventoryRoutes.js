const express = require("express");
const { getAll, getAllProducts, getBySku, checkAvailability } = require("../controllers/inventoryController");

const router = express.Router();

router.get("/products/:sku", getBySku);
router.get('/', getAll);
router.get('/products', getAllProducts)
router.post('/algoritmo', checkAvailability )

module.exports = router;
