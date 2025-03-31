const OrdersRepository = require("../models/ordersRepository.js");
const { sendMessage } = require("../producer");
const axios = require("axios");

// Ajusta la URL según tu configuración real (IP, puertos, etc.).
const PICKING_SERVICE_URL = "http://192.168.0.83:5001/api/picking";

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
    // 1. Obtener los productos asignados al picker desde picking-service
    const { data: assignedProducts } = await axios.get(
      `${PICKING_SERVICE_URL}/assigned/${pickerRUT}`
    );

    if (!assignedProducts || assignedProducts.length === 0) {
      return []; // No hay productos asignados
    }

    // 2. Agrupar productos asignados por orderID
    const orderGroups = {};
    assignedProducts.forEach((prod) => {
      const id = prod.orderID;
      if (!orderGroups[id]) {
        orderGroups[id] = [];
      }
      orderGroups[id].push(prod);
    });

    // 3. Extraer orderID únicos
    const uniqueOrderIDs = Object.keys(orderGroups).map((id) => parseInt(id, 10));

    // 4. Obtener detalles de las órdenes desde la base de datos local
    const orders = await OrdersRepository.getOrdersByIDs(uniqueOrderIDs);

    // 5. Obtener la lista de picking_status desde picking-service
    const { data: statuses } = await axios.get(`${PICKING_SERVICE_URL}/statuses`);
    const statusMap = {};
    statuses.forEach((s) => {
      statusMap[s.pickingStatusID] = s.statusName;
    });

    // 6. Enriquecer cada pedido con el estado real basado en TODOS sus productos
    const enrichedOrders = orders.map((order) => {
      const prods = orderGroups[order.orderID] || [];
      const assignedCount = prods.length;

      // Obtener todos los estados de los productos asignados en este pedido
      const productStatuses = prods.map((p) => p.pickingStatusID);

      // Determinar el estado real del pedido
      let pickingStatusID;
      if (productStatuses.includes(1)) {
        pickingStatusID = 1; // Hay productos pendientes
      } else if (productStatuses.includes(2)) {
        pickingStatusID = 2; // No hay pendientes, pero hay en picking
      } else if (productStatuses.includes(3)) {
        pickingStatusID = 3; // No hay pendientes, pero hay en picking
      } else {
        pickingStatusID = 4; // Todos los productos están completados
      }

      return {
        ...order,
        assignedCount,
        pickingStatusID,
        pickingStatusName: statusMap[pickingStatusID] || "Desconocido",
      };
    });

    const filteredOrders = enrichedOrders.filter(order => order.pickingStatusID !== 4);

    return filteredOrders;
  },

  createOrder: async (orderData, products) => {
    try {
      // 1. Insertar la orden manualmente
      const orderID = await OrdersRepository.createOrder(orderData);

      // 2. Verificar que efectivamente se creó en la DB
      if (!orderID) {
        console.error("❌ No se pudo insertar la orden en la base de datos");
        return null;
      }

      // 3. Recuperar la orden recién insertada con su ID autogenerado
      const order = await OrdersRepository.getOrderById(orderID);
      if (!order) {
        console.error("❌ No se encontró la orden después de crearla");
        return null;
      }

      // 4. Enviar mensaje new.order.created con la orden confirmada de DB
      await sendMessage("new.order.created", { 
        ...order,    // contiene orderID y demás campos
        products     // productos que venían en la solicitud
      });
      console.log(`📤 Evento new.order.created enviado para orderID=${order.orderID}`);

      return orderID;
    } catch (error) {
      console.error("❌ Error en createOrder:", error);
      throw error;
    }
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
