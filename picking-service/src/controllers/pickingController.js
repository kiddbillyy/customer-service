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
    const { pickedQuantity, providedCode, pickerRUT } = req.body;
    
    const updated = await PickingService.updatePickedProduct(
      req.params.orderProductID,
      providedCode,
      pickerRUT,
      pickedQuantity
    );

    if (!updated) {
      return res.status(404).json({ message: "Producto no encontrado, ya completado o code/picker no coincide" });
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
      return res.json([]); 
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

exports.reassignPicker = async (req, res) => {
  try {
    const { orderProductID } = req.params;
    const { newPicker, quantity, reason } = req.body;
    const result = await PickingService.reassignPicker(orderProductID, newPicker, quantity, reason);
    if (!result) {
      return res.status(400).json({ message: "No se pudo reasignar el picker. Verifica la cantidad a reasignar y que el producto exista." });
    }
    res.json({ message: "Picker reasignado correctamente", details: result });
  } catch (error) {
    console.error("❌ Error reasignando picker:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};


exports.getOrderProductsBulk = async (req, res) => {
  try {
    const idsParam = req.query.ids; 
    if (!idsParam) {
      // Si no se pasan IDs, se retorna un arreglo vacío en lugar de error
      return res.json([]);
    }

    // Convertir "30533,30534" en [30533, 30534]
    const orderProductIDs = idsParam
      .split(",")
      .map(id => parseInt(id.trim()))
      .filter(Boolean);

    const result = await PickingService.findOrderProducts(orderProductIDs);
    res.json(result);
  } catch (error) {
    console.error("❌ Error en getOrderProductsBulk:", error);
    res.status(500).json({ message: "Error interno de picking-service" });
  }
};

exports.updateAssignedProductsByPicker = async (req, res) => {
  try {
    const { pickerRUT } = req.params;
    const { orderID, newPickingStatus } = req.body;
    if (!orderID || !newPickingStatus) {
      return res.status(400).json({ message: "Faltan orderID o newPickingStatus" });
    }

    const updatedCount = await PickingService.updateAssignedProductsByPicker(
      pickerRUT,
      orderID,
      newPickingStatus
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        message: "No se encontraron productos asignados para ese picker y pedido."
      });
    }

    res.json({ 
      message: "Productos actualizados correctamente",
      updatedCount 
    });
  } catch (error) {
    console.error("❌ Error en updateAssignedProductsByPicker:", error);
    res.status(500).json({ message: "Error interno picking-service" });
  }
};

exports.updateProductsBulkStatus = async (req, res) => {
  try {
    const { orderID } = req.params;
    const { orderProductIDs } = req.body;

    if (!Array.isArray(orderProductIDs) || orderProductIDs.length === 0) {
      return res.status(400).json({ message: "Debes enviar orderProductIDs en un array." });
    }

    // Llamar a pickingService para poner estos productos en estado 2
    const updatedCount = await PickingService.setProductsInProcess(orderID, orderProductIDs);

    if (updatedCount === 0) {
      return res.status(404).json({ message: "No se encontraron productos para actualizar." });
    }

    res.json({
      message: `Se actualizaron ${updatedCount} productos del pedido ${orderID} al estado 2 (En Proceso).`
    });
  } catch (error) {
    console.error("❌ Error en updateProductsBulkStatus controller:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getAllOrdersProducts = async (req, res) => {
  try {
    const data = await PickingService.getAllOrdersProducts();
    if (!data || data.length === 0) {
      return res.status(404).json({ message: "No hay pedidos/productos." });
    }
    res.json(data);
  } catch (error) {
    console.error("❌ Error obteniendo todos los pedidos con sus productos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getAssignedQuantity = async (req, res) => {
  try {
    const { orderProductID, pickerRUT } = req.query;

    // 1) Buscar en 'order_product_picker' la fila
    const assigned = await PickingService.getAssignedQuantity(orderProductID, pickerRUT);
    if (assigned === null) {
      return res.status(404).json({
        message: "No se encontró asignación para ese orderProductID y pickerRUT"
      });
    }

    // Devuelve { assignedQuantity: number }
    return res.json({ assignedQuantity: assigned });
  } catch (error) {
    console.error("❌ Error al obtener assignedQuantity:", error);
    res.status(500).json({ message: "Error interno de picking-service" });
  }
};

exports.markProductAsMissing = async (req, res) => {
  try {
    const { orderProductID } = req.params;
    const { missingQuantity, pickerRUT } = req.body;

    if (!missingQuantity || missingQuantity <= 0) {
      return res.status(400).json({ message: "La cantidad faltante debe ser mayor a 0." });
    }
    if (!pickerRUT) {
      return res.status(400).json({ message: "Falta el pickerRUT." });
    }

    const result = await PickingService.markProductAsMissing(orderProductID, pickerRUT, missingQuantity);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    return res.status(200).json({ message: "Producto marcado como faltante y asignación actualizada correctamente." });
  } catch (error) {
    console.error("❌ Error marcando producto como faltante:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
