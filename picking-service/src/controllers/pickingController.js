const PickingService = require("../services/pickingService");

exports.assignPickers = async (req, res) => {
  try {
    const { orderID, pickerAssignments } = req.body;
    const newStatus = await PickingService.assignPickers(
      orderID,
      pickerAssignments
    );

    if (!newStatus) {
      return res
        .status(404)
        .json({ message: "No hay productos pendientes en esta orden." });
    }

    const statusMessage =
      newStatus === 3
        ? "Todos los productos tienen pickers asignados. Estado: En Picking"
        : "Algunos productos aún no tienen pickers asignados. Estado: Asignando Pickers";

    res.json({
      message: "Pickers asignados correctamente",
      status: newStatus,
      statusMessage,
    });
  } catch (error) {
    console.error("❌ Error asignando pickers:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.updatePickedProduct = async (req, res) => {
  try {
    const { pickedQuantity } = req.body;
    const updated = await PickingService.updatePickedProduct(
      req.params.orderProductID,
      pickedQuantity
    );
    if (!updated) {
      return res
        .status(404)
        .json({ message: "Producto no encontrado o ya completado" });
    }
    res.json({ message: "Producto actualizado correctamente" });
  } catch (error) {
    console.error("❌ Error actualizando producto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.completePicking = async (req, res) => {
  try {
    const completed = await PickingService.completePicking(req.params.orderID);
    if (!completed) {
      return res.status(404).json({ message: "Aún hay productos pendientes" });
    }
    res.json({ message: "Picking completado y notificado correctamente" });
  } catch (error) {
    console.error("❌ Error completando picking:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getProductsFromOrder = async (req, res) => {
  try {
    const products = await PickingService.getProductsFromOrder(
      req.params.orderID
    );
    if (!products || products.length === 0) {
      return res.status(400).json({ message: "No hay productos en la orden" });
    }
    res.json(products);
  } catch (error) {
    console.error("❌ Error obtener productos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getStatuses = async (req, res) => {
  try {
    const statues = await PickingService.getStatuses();
    res.json(statues);
  } catch (error) {
    console.error("❌ Error obteniendo estados:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getProductsAssignedToPicker = async (req, res) => {
  try {
    const products = await PickingService.getProductsAssignedToPicker(
      req.params.pickerRUT
    );
    if (!products || products.length === 0) {
      return res
        .status(404)
        .json({ message: "No hay productos asignados a este picker" });
    }
    res.json(products);
  } catch (error) {
    console.error("❌ Error obtener productos asignados:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getProductsAssignedFromOrder = async (req, res) => {
  try {
    const { pickerRUT, orderID } = req.params;
    const products = await PickingService.getProductsAssignedFromOrder(
      pickerRUT,
      orderID
    );
    if (!products || products.length === 0) {
      return res.status(404).json({
        message: "No hay productos asignados para este picker en este pedido.",
      });
    }
    res.json(products);
  } catch (error) {
    console.error(
      "❌ Error obteniendo productos asignados para el pedido:",
      error
    );
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
