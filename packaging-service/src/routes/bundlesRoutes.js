const express = require("express");
const {
  createBundle,
  getBundlesByOrder,
  getBundleDetails,
  getOrderProductsWithBundleID,
  getAllBundles,
  updateBundleDimensions
} = require("../controllers/bundlesController");

const {
  createBundleValidator,
  getBundleDetailsValidator,
  getBundlesByOrderValidator,
  getOrderProductsWithBundleIDValidator,
  updateBundleDimensionsValidator
} = require("../middleware/bundlesValidator");

const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

// Obtener todos los bultos
router.get("/", getAllBundles);

// Crear un bulto
router.post("/create", createBundleValidator, validateRequest, createBundle);

// Obtener bultos de una orden
router.get("/:orderID", getBundlesByOrderValidator, validateRequest, getBundlesByOrder);

// Obtener detalles de un bulto
router.get("/bundle/:bundleID", getBundleDetailsValidator, validateRequest, getBundleDetails);

// Obtener productos con bundleID
router.get("/order-products/:orderID", getOrderProductsWithBundleIDValidator, validateRequest, getOrderProductsWithBundleID);

// Actualizar dimensiones del bulto
router.put("/dimensions/:bundleID", updateBundleDimensionsValidator, validateRequest, updateBundleDimensions);


module.exports = router;
