const express = require("express");
const {
  createBundle,
  getBundlesByOrder,
  getBundleDetails,
  getOrderProductsWithBundleID,
  getAllBundles,
  updateBundleDimensions,
  updateBundleDraft,
  finalizeOrderPackaging,
  getBundlesByPicker
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
router.post("/create", createBundle);

// Obtener bultos de una orden
router.get("/:orderID", getBundlesByOrderValidator, validateRequest, getBundlesByOrder);

// Obtener detalles de un bulto
router.get("/bundle/:bundleID", getBundleDetailsValidator, validateRequest, getBundleDetails);

// Obtener productos con bundleID
router.get("/order-products/:orderID", getOrderProductsWithBundleIDValidator, validateRequest, getOrderProductsWithBundleID);

// Actualizar dimensiones del bulto
router.put("/dimensions/:bundleID", updateBundleDimensionsValidator, validateRequest, updateBundleDimensions);

// Nuevo endpoint para actualizar un bulto en draft (agregar/quitar productos, cambiar height, etc.)
router.put("/update/:bundleID", updateBundleDraft);

// Endpoint para finalizar el packaging de una orden
router.post("/finalize/:orderID", finalizeOrderPackaging);

// Bultos creados por un picker a un pedido
router.get("/order/:orderID/picker/:pickerRUT", getBundlesByPicker);


module.exports = router;
