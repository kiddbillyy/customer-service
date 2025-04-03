const express = require("express");
const {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getMaxCreatets,
  getLastQueryDate,
  getHistory,
  getOrdersAudit,
  getOrdersByPickerRUT
} = require("../controllers/ordersController");

const authMiddleware = require("../middleware/authMiddleware");
const userRole = require("../utils/roles");

const router = express.Router();

// Rutas
router.get("/", getAllOrders); // API para obtener todas las órdenes
router.get("/byIds/:pickerRUT", getOrdersByPickerRUT); // API para obtener ordenes asociadas a un picker
router.get("/pending-audit", getOrdersAudit);
router.get("/:id", getOrderById); // API para obtener una orden por su ID
router.put("/:id/status", updateOrderStatus); // API para actualizar el estado de una orden
router.get("/max/createts", getMaxCreatets); // API para obtener la fecha de la última orden creada
router.get("/max/lastQueryDate", getLastQueryDate); // API para obtener la fecha de la última consulta
router.get("/history/:id", getHistory); // API para obtener el historial de una orden

// authMiddleware([userRole.ADMIN, userRole.ASSIGNER]) para asignar múltiples roles
module.exports = router;
