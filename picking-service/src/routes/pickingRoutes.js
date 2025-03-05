// src/routes/pickingRoutes.js
const express = require("express");
const {
  assignPickers,
  updatePickedProduct,
  completePicking,
  getProductsFromOrder,
  getProductsAssignedToPicker,
  getProductsAssignedFromOrder,
  getStatuses,
  reassignPicker 
} = require("../controllers/pickingController");

const {
  assignPickersValidator,
  updatePickedProductValidator,
  completePickingValidator,
  getProductsFromOrderValidator,
  reassignPickerValidator 
} = require("../middleware/pickingValidator");

const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

// Asignar pickers a una orden
router.post("/assign", assignPickersValidator, validateRequest, assignPickers);

// Obtener productos asignados a un picker
router.get("/assigned/:pickerRUT", getProductsAssignedToPicker);

router.get("/statuses", getStatuses);

// Obtener productos asignados de un picker para un pedido específico
router.get("/assigned/:pickerRUT/order/:orderID", getProductsAssignedFromOrder);

// Actualizar cantidad pickeada de un producto en una orden
router.put(
  "/product/:orderProductID",
  updatePickedProductValidator,
  validateRequest,
  updatePickedProduct
);

// Completar picking de una orden
router.put(
  "/complete/:orderID",
  completePickingValidator,
  validateRequest,
  completePicking
);

// Endpoint para reasignar picking de un producto
router.put(
  "/reassign/:orderProductID",
  reassignPickerValidator,
  validateRequest,
  reassignPicker
);

// Obtener productos de una orden
router.get(
  "/products/:orderID",
  getProductsFromOrderValidator,
  validateRequest,
  getProductsFromOrder
);

module.exports = router;
