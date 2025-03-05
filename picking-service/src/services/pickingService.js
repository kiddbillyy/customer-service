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

  updatePickedProduct: async (orderProductID, pickedQuantity, itemcode, pickerRUT) => {
    // Obtener información global del producto
    const orderProduct = await PickingRepository.getOrderProduct(orderProductID);
    if (!orderProduct) {
      console.error(`❌ No se encontró el producto con orderProductID ${orderProductID}`);
      return false;
    }
    
    // Validar que el itemcode enviado coincida con el asignado
    if (orderProduct.itemcode !== itemcode) {
      console.error(
        `❌ El itemcode proporcionado (${itemcode}) no coincide con el asignado (${orderProduct.itemcode}).`
      );
      return false;
    }
    
    // Calcular cuántos items faltan globalmente
    const remaining = orderProduct.quantity - orderProduct.pickedQuantity;
    if (remaining <= 0) {
      console.log(`El producto ${orderProductID} ya está completamente pickeado.`);
      return false;
    }
    
    // Se agrega como máximo la cantidad faltante
    const quantityToAdd = Math.min(pickedQuantity, remaining);
    
    const updated = await PickingRepository.updatePickedProduct(
      orderProductID,
      quantityToAdd,
      itemcode,
      pickerRUT
    );
    if (!updated) {
      console.error(`❌ Error actualizando el producto ${orderProductID}`);
      return false;
    }
    
    console.log(
      `✅ Producto ${orderProductID} actualizado con ${quantityToAdd} unidades recogidas para el picker ${pickerRUT}.`
    );
    
    // Resto de la lógica de notificación...
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