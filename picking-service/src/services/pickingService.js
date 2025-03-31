const PickingRepository = require("../models/pickingRepository");
const packagingServiceClient = require("../client/packagingServiceClient.js")
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
    const enriched = [];

    for (const p of filteredProducts) {
      // Llamada HTTP a packaging-service
      const totalInBultos = await packagingServiceClient.fetchAssignedToPicker(p.orderProductID, p.Pickeador);

      // asume p.quantity es la cantidad total para ese product/picker
      const assignedQuantity = p.quantity; 
      const availableForPacking = assignedQuantity - totalInBultos;

      enriched.push({
        ...p,
        availableForPacking
      });
    }
    

    return enriched;

  },

  getProductsAssignedToPicker: async (pickerRUT) => {
    return await PickingRepository.getProductsAssignedToPicker(pickerRUT);
  },

  updatePickedProduct: async (orderProductID, providedCode, pickerRUT, pickedQuantity) => {


    // 1) Obtener información actual de la DB (incluyendo codebars)
    
    const assignment = await PickingRepository.getAssignment(orderProductID, pickerRUT);
    if (!assignment) {
      console.warn(`⚠️ El producto ${orderProductID} no está asignado al picker ${pickerRUT}`);
      return false;
    }
    
    const orderProduct = await PickingRepository.getOrderProduct(orderProductID);
    if (!orderProduct) {
      console.error(`❌ No se encontró el producto con orderProductID ${orderProductID}`);
      return false;
    }
  
    // 2) Verificar si providedCode coincide con itemcode O con codebars
    if (orderProduct.itemcode != providedCode && orderProduct.codebars != providedCode) {
      console.error(
        `❌ El code proporcionado (${providedCode}) no coincide con itemcode=(${orderProduct.itemcode}) ni codebars=(${orderProduct.codebars}).`
      );
      return false;
    }
  
    // 3) Calcular cuántos ítems YA estaban pickeados
    const oldPicked = orderProduct.pickedQuantity;
  
    // 4) Interpreta "pickedQuantity" como la "cantidad extra que sumas" (increment)
    const difference = pickedQuantity; 
    if (difference <= 0) {
      console.log(`ℹ️ No hay aumento en la cantidad pickeada (o se envió un valor menor o igual a 0).`);
      return false;
    }
  
    // 5) Verificar cuánto faltaba
    const remaining = orderProduct.quantity - oldPicked;
    if (remaining <= 0) {
      console.log(`ℹ️ El producto ${orderProductID} ya está completamente pickeado.`);
      return false;
    }
  
    // 6) Cantidad efectiva a sumar
    const quantityToAdd = Math.min(difference, remaining);
  
    // 7) Llamamos al repository para aplicar la actualización
    //    Pasamos itemcode sacado de DB
    const updated = await PickingRepository.updatePickedProduct(
      orderProductID,
      quantityToAdd,        
      orderProduct.itemcode, // Aquí pasamos el itemcode real
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
        console.log(`✅ Todos los productos de la orden ${orderID} han sido pickeados. Notificando...`);
        await sendMessage("order.status.updated", { orderID, newStatus: 5 });
        console.log(`📤 Estado de la orden ${orderID} actualizado a 5 (Picking Completado)`);
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
  handleBundleReady: async (msg) => {
    console.log("🎯 handleBundleReady con:", msg);

    // Validaciones mínimas
    if (!msg.orderProductIDs || msg.orderProductIDs.length === 0) {
      console.log("⚠️ Ningún orderProductID enviado en bundle.ready, nada que actualizar");
      return;
    }

    // Llamas al repositorio para marcar estos productos como '4' (empacado)
    await PickingRepository.updateProductsToPacked(msg.orderProductIDs);

    console.log(`✅ Se actualizaron ${msg.orderProductIDs.length} productos a estado=4 (empacado).`);
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
  
  handleNewBundle: async (msg) => {
    console.log('Procesando nuevo bulto');

    if(!msg.bundleID){
      console.error('❌ El ID del bulto no fue proporcionado')
      return;
    }
    if (!msg.products?.length) {
      console.error('❌ No hay productos en el mensaje');
      return false;
    }
    
    await PickingRepository.handleNewBundle(msg);

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
  
  getAssignedQuantity: async (orderProductID, pickerRUT) => {
    return await PickingRepository.getAssignedQuantity(orderProductID, pickerRUT);
  },
  
  updateProductsBulkStatus: async (orderID, pickerRUT, newStatus) => {
    // Llamar a PickingRepository para actualizar los productos asignados
    const updatedCount = await PickingRepository.bulkUpdateProductStatus(orderID, pickerRUT, newStatus);
  
    return updatedCount; // Retorna el número de filas afectadas
  },
  setProductsInProcess: async (orderID, orderProductIDs) => {
    // Llamar al repositorio para update a pickingStatusID=2
    // en order_product y order_product_picker
    return await PickingRepository.bulkSetProductsInProcess(orderID, orderProductIDs);
  },
  getAllOrdersProducts: async () => {
    // 1. Obtenemos todas las filas de order_product (JOIN con products)
    const rows = await PickingRepository.getAllOrderProducts();
    if (!rows || rows.length === 0) {
      return [];
    }

    // 2. Agrupar por orderID
    const ordersMap = {};
    for (const row of rows) {
      const orderID = row.orderID;
      if (!ordersMap[orderID]) {
        ordersMap[orderID] = {
          orderID,
          products: []
        };
      }
      // Construir objeto de producto
      const productData = {
        orderProductID: row.orderProductID,
        itemcode: row.itemcode,
        dscription: row.dscription,
        price: row.price,
        quantity: row.quantity,
        pickedQuantity: row.pickedQuantity,
        pickingStatusID: row.pickingStatusID,
        total: row.total,
        isAssigned: row.isAssigned
      };
      ordersMap[orderID].products.push(productData);
    }

    // 3. Convertir el objeto final en un array
    return Object.values(ordersMap);
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