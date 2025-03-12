const OrdersRepository = require("../models/ordersRepository.js");
const { sendMessage } = require("../producer");
const axios = require("axios");

// Ajusta la URL según tu configuración real (IP, puertos, etc.).
const PICKING_SERVICE_URL = "http://192.168.0.82:5001/api/picking";

const OrdersService = {
  getAllOrders: async () => {
    return await OrdersRepository.getAllOrders();
  },
  getOrdersAudit: async () => {
    return await OrdersRepository.getOrdersAudit();
  },
  getOrderById: async (orderID) => {
    return await OrdersRepository.getOrderById(orderID);
  },
  getHistory: async (orderID) => {
    return await OrdersRepository.getHistory(orderID);
  },
  getOrdersByPickerRUT: async (pickerRUT) => {
    // 1. Llamar al picking-service para obtener los productos asignados al picker
    const { data: assignedProducts } = await axios.get(
      `${PICKING_SERVICE_URL}/assigned/${pickerRUT}`
    );
  
    if (!assignedProducts || assignedProducts.length === 0) {
      return []; // No hay productos asignados
    }
  
    // 2. Agrupar los productos asignados por orderID
    const orderGroups = {};
    assignedProducts.forEach((prod) => {
      const id = prod.orderID;
      if (!orderGroups[id]) {
        orderGroups[id] = [];
      }
      orderGroups[id].push(prod);
    });
  
    // 3. Extraer los orderID únicos
    const uniqueOrderIDs = Object.keys(orderGroups).map((id) => parseInt(id, 10));
  
    // 4. Consultar la base de datos de orders (local) para obtener los detalles de esos pedidos
    const orders = await OrdersRepository.getOrdersByIDs(uniqueOrderIDs);
  
    // 5. Llamar al picking-service para obtener la lista de picking_status
    const { data: statuses } = await axios.get(`${PICKING_SERVICE_URL}/statuses`);
    // Se espera que 'statuses' sea un array de objetos:
    // [ { pickingStatusID: 1, statusName: "No asignado" }, { pickingStatusID: 2, statusName: "Asignado" }, ... ]
    const statusMap = {};
    statuses.forEach((s) => {
      statusMap[s.pickingStatusID] = s.statusName;
    });
  
    // 6. Enriquecer cada pedido con:
    //    - assignedCount: cuántos productos tiene asignados
    //    - pickingStatusID / pickingStatusName: Por ejemplo,
    //      tomamos la del PRIMER producto asignado (o podrías unificar si hay más de uno)
    const enrichedOrders = orders.map((order) => {
      const prods = orderGroups[order.orderID] || [];
      const assignedCount = prods.length;
  
      // Si cada pedido solo maneja un pickingStatus "principal", puedes elegir el del primer producto
      // O unificar la lógica si hay múltiples estados. Ejemplo: prods[0]?.pickingStatusID
      const pickingStatusID = prods[0]?.pickingStatusID || null;
      const pickingStatusName = pickingStatusID ? statusMap[pickingStatusID] : null;
  
      return {
        ...order,
        assignedCount,
        pickingStatusID,
        pickingStatusName,
      };
    });
  
    return enrichedOrders;
  },

  createOrder: async (orderData, products) => {
    const orderID = await OrdersRepository.createOrder(orderData);
    if (orderID) {
      // Enviamos la orden a `picking-service` con los productos
      await sendMessage("sap.order.imported", { ...orderData, products });
      console.log(`📤 Orden ${orderID} enviada a Kafka con productos`);
    }
    return orderID;
  },

  updateOrderStatus: async (orderID, orderStatusID) => {
    const currentOrder = await OrdersRepository.getOrderById(orderID);
    if (!currentOrder) {
      console.warn(`⚠️ Orden ${orderID} no encontrada.`);
      return false;
    }

    // Si ya está en ese estado, no reenviamos evento.
    if (currentOrder.orderStatusID === orderStatusID) {
      console.log(
        `ℹ️ Estado de la orden ${orderID} ya es ${orderStatusID}, no se enviará otro mensaje.`
      );
      return false;
    }

    const updated = await OrdersRepository.updateOrderStatus(
      orderID,
      orderStatusID
    );

    if (updated) {
      // Notificar vía Kafka
      await sendMessage("order.status.updated", {
        orderID,
        newStatus: orderStatusID,
      });
      console.log(
        `📤 Estado de la orden ${orderID} actualizado a ${orderStatusID}`
      );
    }
    return updated;
  },

  getMaxCreatets: async () => {
    const maxCreatets = await OrdersRepository.getMaxCreatets();
    console.log(`✅ maxCreatets obtenido en Service: ${maxCreatets}`);
    return maxCreatets;
  },

  getLastQueryDate: async () => {
    const lastQueryDate = await OrdersRepository.getLastQueryDate();
    console.log(`✅ lastQueryDate obtenido en Service: ${lastQueryDate}`);
    return lastQueryDate;
  },
};

module.exports = OrdersService;
