const PickingRepository = require("../models/pickingRepository");
const { sendMessage } = require("../producer");
const axios = require("axios");

const ORDERS_SERVICE_URL = "http://orders-service:5000/api/orders";

const PickingService = {
  assignPickers: async (orderID, pickerAssignments) => {
    // Obtener estado actual de la orden desde orders-service
    let currentStatus;
    try {
      const response = await axios.get(`${ORDERS_SERVICE_URL}/${orderID}`);
      currentStatus = response.data.orderStatusID;
    } catch (error) {
      console.error(
        `❌ Error obteniendo estado de la orden ${orderID} desde orders-service: `,
        error.message
      );
      return false;
    }

    const newStatus = await PickingRepository.assignPickers(
      orderID,
      pickerAssignments
    );

    // Evitar mensajes de estado innecesarios
    if (currentStatus !== newStatus) {
      await sendMessage("order.status.updated", { orderID, newStatus });
      console.log(
        `📤 Estado de la orden ${orderID} actualizado a ${newStatus}`
      );
    } else {
      console.log(
       ` ℹ️ La orden ${orderID} ya está en estado ${newStatus}, no se envía nuevo mensaje.`
      );
    }
    return newStatus;
  },

  getProductsFromOrder: async (orderID) => {
    return await PickingRepository.getProductsFromOrder(orderID);
  },

  getStatuses: async () => {
    return await PickingRepository.getStatuses();
  },

  getProductsAssignedFromOrder: async (pickerRUT, orderID) => {
    // Primero, obtenemos todos los productos asignados a este picker
    const products = await PickingRepository.getProductsAssignedFromOrder(
      pickerRUT
    );
    // Luego, filtramos aquellos que pertenecen al orderID indicado
    const filteredProducts = products.filter((prod) => prod.orderID == orderID);
    return filteredProducts;
  },

  getProductsAssignedToPicker: async (pickerRUT) => {
    return await PickingRepository.getProductsAssignedToPicker(pickerRUT);
  },

  updatePickedProduct: async (orderProductID, increment, itemcode, pickerRUT) => {
    // 1) Obtener información actual de la DB
    const orderProduct = await PickingRepository.getOrderProduct(orderProductID);
    if (!orderProduct) {
      console.error(`❌ No se encontró el producto con orderProductID ${orderProductID}`);
      return false;
    }

    // 2) Validar itemcode
    if (orderProduct.itemcode !== itemcode) {
      console.error(
        `❌ El itemcode proporcionado (${itemcode}) no coincide con el asignado (${orderProduct.itemcode}).`
      );
      return false;
    }

    // 3) Calcular cuántos ítems YA estaban pickeados
    const oldPicked = orderProduct.pickedQuantity;

    // 4) Aquí interpretamos "increment" como la cantidad extra que vas a sumar
    const difference = increment; 
    if (difference <= 0) {
      console.log(`ℹ️ No hay aumento en la cantidad pickeada (o se envió un valor menor o igual a 0).`);
      return false;
    }

    // 5) Verificar cuánto falta realmente
    const remaining = orderProduct.quantity - oldPicked; // lo que quedaba por recoger
    if (remaining <= 0) {
      console.log(`ℹ️ El producto ${orderProductID} ya está completamente pickeado.`);
      return false;
    }

    // 6) La cantidad efectiva que sumarás es el mínimo entre "difference" y "remaining"
    const quantityToAdd = Math.min(difference, remaining);

    // 7) Llamamos al repository para aplicar la actualización
    const updated = await PickingRepository.updatePickedProduct(
      orderProductID,
      quantityToAdd,        // <--- Se envía la "diferencia"
      itemcode,
      pickerRUT
    );
    if (!updated) {
      console.error(`❌ Error actualizando el producto ${orderProductID}`);
      return false;
    }

    console.log(
      `✅ Producto ${orderProductID} actualizado con ${quantityToAdd} unidades recogidas (incremento) para el picker ${pickerRUT}.`
    );

    // 8) Verificar si la orden ya está toda pickeada
    const { orderID } = await getorderIDByOrderProduct(orderProductID);
    if (orderID) {
      const isComplete = await PickingRepository.isOrderFullyPicked(orderID);
      if (isComplete) {
        console.log(
          `✅ Todos los productos de la orden ${orderID} han sido pickeados. Notificando...`
        );
        await sendMessage("order.status.updated", { orderID, newStatus: 5 });
        console.log(
          `📤 Estado de la orden ${orderID} actualizado a 5 (Picking Completado)`
        );
      }
    }

    return updated;
  },
  
  handleBundleCreated: async ({ bundleID, products }) => {
    if (!bundleID || !products?.length) {
      console.warn("⚠️ bundle.created sin datos suficientes para actualizar picking");
      return;
    }

    // Delegar a la capa de persistencia
    await PickingRepository.updateOrderProductPicker(bundleID, products);
  },
  
  handleOrderStatusUpdated: async ({ orderID, newStatus }) => {
    if (!orderID || typeof newStatus !== "number") {
      console.warn("⚠️ order.status.updated con datos insuficientes");
      return;
    }

    if (newStatus === 2) {
      console.log(`📦 Orden ${orderID} pasó a "Asignando Pickers", verificando asignación...`);
      
      // Llamar al repositorio para obtener los productos de la orden
      const products = await PickingRepository.getProductsByOrder(orderID);
      
      if (products.length === 0) {
        console.warn(`⚠️ No hay productos en la orden ${orderID} para asignar pickers.`);
      } else {
        console.log(`📌 La orden ${orderID} tiene ${products.length} productos pendientes de asignación.`);
      }
    }

    if (newStatus === 3) {
      console.log(`✅ Orden ${orderID} ahora está "En Picking". Se pueden empezar a recoger productos.`);
      // Aquí podrías agregar más lógica si es necesario (ejemplo: actualizar algo en BD)
    }
  },
  handleNewOrderCreated: async ({ orderID, products }) => {
    console.log(`📥 Procesando nueva orden orderID=${orderID} en Picking Service...`);

    if (!products || products.length === 0) {
      console.warn(`⚠️ No hay productos en la orden ${orderID}, se omite registro en Picking Service.`);
      return;
    }

    // Insertar productos en la base de datos
    for (let product of products) {
      await PickingRepository.insertOrUpdateProduct(product);
      await PickingRepository.insertOrUpdateOrderProduct(orderID, product);
    }

    console.log(`✅ Productos de la orden ${orderID} registrados en Picking Service`);
  },
  

  completePicking: async (orderID) => {

    // Verificar si hay productos con pickedQuantity < quantity
    const hasMissingProducts = await PickingRepository.hasMissingProducts(orderID);
    if (hasMissingProducts) {
      await sendMessage("order.status.updated", { orderID, newStatus: 4 });
      console.log(`📤 Estado de la orden ${orderID} -> 4 (Picking Incompleto)`);
    } else {
      await sendMessage("order.status.updated", { orderID, newStatus: 5 });
      console.log(`📤 Estado de la orden ${orderID} -> 5 (Picking Completado)`);
    }
  
    // Enviar evento de finalización de picking
    await sendMessage("picking.completed", { orderID });
  
    return true;
  },
  reassignPicker: async (orderProductID, newPicker, quantity, reason) => {
    // 1. Obtener el producto global
    const product = await PickingRepository.getOrderProduct(orderProductID);
    if (!product) {
      console.error(`❌ No se encontró el producto con orderProductID ${orderProductID}`);
      return false;
    }
    
    // 2. Obtener la asignación original (del primer picker)
    const currentAssignment = await PickingRepository.getOrderProductPicker(orderProductID);
    if (!currentAssignment) {
      console.error("No se encontró asignación actual para el producto.");
      return false;
    }
    
    // Se asume que currentAssignment.assignedQuantity representa la cantidad asignada originalmente al primer picker.
    // Y que currentAssignment.pickedQuantity es lo que ese picker recogió.
    const totalAssigned = currentAssignment.assignedQuantity || product.quantity;
    const alreadyPicked = currentAssignment.pickedQuantity;
    
    // Calcular el faltante (lo que no recogió el primer picker)
    const missing = totalAssigned - alreadyPicked;
    
    if (missing <= 0) {
      console.log(`El producto ${orderProductID} ya está completo; no se puede reasignar.`);
      return false;
    }
    
    if (quantity > missing) {
      console.error(`La cantidad a reasignar (${quantity}) excede el faltante (${missing}).`);
      return false;
    }
    
    // 3. NO actualizamos el registro original, para conservar su assignedQuantity (p.ej., 5)
    
    // 4. Registrar la reasignación en picker_reassignments
    const reassignmentID = await PickingRepository.recordPickerReassignment({
      orderProductID,
      oldPicker: currentAssignment.pickerRUT,
      newPicker,
      reason,
    });
    
    // 5. Crear una nueva asignación para el nuevo picker con assignedQuantity igual al faltante a reasignar (la cantidad enviada)
    const newAssignmentID = await PickingRepository.createAdditionalAssignment(orderProductID, newPicker, quantity);
    
    return {
      orderProductID,
      oldPicker: currentAssignment.pickerRUT,
      newPicker,
      reassignmentID,
      newAssignmentID,
      assignedQuantity: quantity,
    };
  },

  findOrderProducts: async (orderProductIDs) => {
    return await PickingRepository.findOrderProductsByIds(orderProductIDs);
  },
  updateAssignedProductsByPicker: async (pickerRUT, orderID, newPickingStatus) => {
    return await PickingRepository.updateAssignedProductsByPicker(pickerRUT, orderID, newPickingStatus);
  },
  
  updateProductsBulkStatus: async (orderID, pickerRUT, newStatus) => {
    // Llamar a PickingRepository para actualizar los productos asignados
    const updatedCount = await PickingRepository.bulkUpdateProductStatus(orderID, pickerRUT, newStatus);
  
    return updatedCount; // Retorna el número de filas afectadas
  },

  
};

/**
 * Obtener el orderID dada la relación con orderProductID.
 * (Podrías mover esto a un Repository si lo usas frecuentemente)
 */
async function getorderIDByOrderProduct(orderProductID) {
  const { default: pool } = await import("../config/db.js");
  const [rows] = await pool.query(
    `SELECT orderID FROM Order_Product WHERE orderProductID = ?`,
    [orderProductID]
  );
  return rows[0] || {};
}

module.exports = PickingService;