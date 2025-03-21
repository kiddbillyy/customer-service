const WaveRepository = require('../models/waveRepository');
const PickingRepository = require('../models/pickingRepository')
const { sendMessage } = require("../producer");
const axios = require("axios");

const ORDERS_SERVICE_URL = "http://orders-service:5000/api/orders";

const WaveService = {
  async createWave(waveData) {
    // Ejemplo: waveData = { pickingPoint: 'Palermo', startDate, endDate, ... }
    const waveID = await WaveRepository.createWave(waveData);
    return waveID;
  },

  async createRound(roundData) {
    return await WaveRepository.createRound(roundData);
  },

  async assignProductsToRound(roundID, products) {
    // products = [ { orderID, orderProductID }, ... ]
    await WaveRepository.assignProductsToRound(roundID, products);
    // Podrías actualizar "productsCount" e "itemsCount" en picking_rounds si quieres
  },

  async updateWaveStatus(waveID, newStatus) {
    await WaveRepository.updateWaveStatus(waveID, newStatus);
  },

  async updateRoundStatus(roundID, newStatus) {
    await WaveRepository.updateRoundStatus(roundID, newStatus);
  },
  async getWaves() {
    return await WaveRepository.getWaves();
  },
  async getRounds() {
    return await WaveRepository.getRounds();
  },

  // Función para obtener una ola por ID
  async getWaveById(waveID) {
    return await WaveRepository.getWaveById(waveID);
  },

  // Función para obtener todas las rondas de una ola
  async getRoundsByWave(waveID) {
    return await WaveRepository.getRoundsByWaveId(waveID);
  },

  // Función para obtener una ronda por ID (y opcionalmente validar que pertenezca a la ola)
  async getRoundById(waveID, roundID) {
    const round = await WaveRepository.getRoundById(roundID);
    // Opcional: verificar que la ronda pertenece a la ola solicitada
    if (round && round.waveID == waveID) {
      return round;
    }
    return null;
  },

  assignProductsAndPickers: async (waveID, roundID, orderID, pickerAssignments) => {
    // 1) Obtener estado actual de la orden desde orders-service
    let oldStatus;
    try {
      const response = await axios.get(`${ORDERS_SERVICE_URL}/${orderID}`);
      oldStatus = response.data.orderStatusID; // adaptado a tu JSON real
    } catch (error) {
      console.error(`❌ Error obteniendo estado de la orden ${orderID} desde orders-service:`, error.message);
      return false; // O lanza una excepción si prefieres
    }

    // 2) upsert en picking_round_products (para vincular el orderProductID a la ronda)
    for (const { orderProductID } of pickerAssignments) {
      await WaveRepository.upsertRoundProduct(roundID, orderID, orderProductID);
    }

    // 3) Asignar pickers en 'order_product_picker' (recicla la lógica de assignPickersToProducts)
    const newStatus = await PickingRepository.assignPickersToProducts(orderID, pickerAssignments);

    // 4) Si newStatus es falso (no se actualizaron), retorna falso
    if (!newStatus) {
      return false;
    }

    // 5) Si el newStatus difiere del oldStatus, publicamos el evento
    if (oldStatus != newStatus) {
      await sendMessage("order.status.updated", { orderID, newStatus });
      console.log(`📤 Estado de la orden ${orderID} actualizado a ${newStatus}`);
    } else {
      console.log(`ℹ️ La orden ${orderID} ya está en estado ${newStatus}, no se envía nuevo mensaje.`);
    }

    // 6) Devolvemos un objeto con los dos estados (por si el controlador quiere usarlos)
    return { newStatus, oldStatus };
  },

  
  // Unificar asignación de productos y pickers
  assignProductsAndPickers: async (waveID, roundID, orderID, pickerAssignments) => {
    // 1) Obtener estado actual de la orden desde orders-service
    let oldStatus;
    try {
      const response = await axios.get(`${ORDERS_SERVICE_URL}/${orderID}`);
      oldStatus = response.data.orderStatusID; // adaptar a tu JSON real
    } catch (error) {
      console.error(`❌ Error obteniendo estado de la orden ${orderID} desde orders-service:`, error.message);
      return false;
    }

    // 2) upsert en picking_round_products
    for (const { orderProductID } of pickerAssignments) {
      await WaveRepository.upsertRoundProduct(roundID, orderID, orderProductID);
    }

    // 3) Asignar pickers en 'order_product_picker'
    const newStatus = await PickingRepository.assignPickersToProducts(orderID, pickerAssignments);

    // 4) Si no se pudo asignar, retorna false
    if (!newStatus) {
      return false;
    }

    // 5) Si cambió el estado, publicamos el evento
    if (oldStatus != newStatus) {
      await sendMessage("order.status.updated", { orderID, newStatus });
      console.log(`📤 Estado de la orden ${orderID} actualizado a ${newStatus}`);
    } else {
      console.log(`ℹ️ La orden ${orderID} ya está en estado ${newStatus}, no se envía nuevo mensaje.`);
    }

    // Devolvemos los estados
    return { newStatus, oldStatus };
  },

  async assignProductsAndPickersNoOrderID(waveID, roundID, products) {
    // 1) Agrupemos "orderID" para el 'oldStatus' logic
    //    Podríamos tener varios orderIDs. 
    //    Si deseas un estado "global", debes decidir cómo unificarlo
    //    (Por simplicidad, obtendremos oldStatus solo del PRIMER pedido).
    let oldStatus = null;
    let firstOrderID = null;

    // 2) Recorremos cada item, consultamos su orderID
    const itemDetails = [];
    for (const { orderProductID, pickerRUT } of products) {
      // SELECT orderID from order_product
      const row = await PickingRepository.getOrderProductAndOrderID(orderProductID);
      if (!row) continue;

      const { orderID, quantity } = row;
      // guardar en itemDetails para el picking assignment
      itemDetails.push({ orderProductID, pickerRUT, orderID, quantity });

      // upsert en picking_round_products
      await WaveRepository.upsertRoundProduct(roundID, orderID, orderProductID);

      // Lógica para "oldStatus" => solo si no lo tenemos
      if (firstOrderID == null) {
        firstOrderID = orderID;
      }
    }

    if (itemDetails.length === 0) {
      // No hay nada que asignar
      return false;
    }

    // 3) Obtener oldStatus del primer orderID (opcional, si deseas mandar a orders-service)
    if (firstOrderID) {
      try {
        const response = await axios.get(`${ORDERS_SERVICE_URL}/${firstOrderID}`);
        oldStatus = response.data.orderStatusID;
      } catch (error) {
        console.error(`❌ Error obteniendo estado de la orden ${firstOrderID} desde orders-service:`, error.message);
        // Podrías ignorar o retornar false
      }
    }

    // 4) Asignar pickers en order_product_picker
    //    NOTA: Podrías crear un pickingRepository method que reciba itemDetails con {orderProductID, pickerRUT}
    //    y no requiera un orderID global. 
    //    Reusamos 'assignPickersToProducts' con un "falso" orderID => 
    //    Realmente, assignPickersToProducts revisa "SELECT orderProductID FROM order_product WHERE orderID=? and pickingstatusid=1/2" => 
    //    Esto asume un solo orderID. 
    //    MEJOR: crear un method "assignPickersItems(items)" que no requiera orderID global.

    // 4a) Creamos un array de "fake" group by orderID
    const orderGroups = {};
    for (const item of itemDetails) {
      if (!orderGroups[item.orderID]) {
        orderGroups[item.orderID] = [];
      }
      orderGroups[item.orderID].push({
        orderProductID: item.orderProductID,
        pickerRUT: item.pickerRUT
      });
    }

    let finalStatus = 2; // 2 => "AsignandoPickers"
    for (const [anOrderID, groupAssignments] of Object.entries(orderGroups)) {
      // Llamamos un método adaptado que asigne sin filtrar pickingStatus=1/2 
      // o creamos un method "assignPickersForOrder" con la actual logic
      const status = await PickingRepository.assignPickersToProducts(parseInt(anOrderID, 10), groupAssignments);
      // combinamos "status" => si uno es 3 => finalStatus=3
      if (status === 3) {
        finalStatus = 3;
      }
    }

    // 5) oldStatus vs newStatus => si deseas mandar "order.status.updated"
    //    OJO: Podrías mandar 1 evento por cada orderID. 
    //    Por simplicidad, mandar uno por el "primer" orderID:
    if (oldStatus != null && finalStatus !== false && oldStatus != finalStatus && firstOrderID) {
      await sendMessage("order.status.updated", { orderID: firstOrderID, newStatus: finalStatus });
      console.log(`📤 Estado de la orden ${firstOrderID} actualizado a ${finalStatus}`);
    }

    // devolvemos un objeto con newStatus=finalStatus, oldStatus
    return { newStatus: finalStatus, oldStatus };
  },

  /**
   * Actualiza las columnas 'ordersCount', 'productsCount', 'itemsCount' en picking_rounds 
   * en base a picking_round_products (para saber cuántos 'orderID' únicos hay, cuántos 'orderProductID', y suma de quantity).
   */
  async updateRoundCounts(roundID) {
    // 1) Obtener la lista de (orderID, orderProductID) en picking_round_products
    const roundProds = await WaveRepository.getRoundProducts(roundID);
    if (!roundProds || roundProds.length === 0) {
      // no hay nada
      await WaveRepository.updateRoundCounts(roundID, 0, 0, 0);
      return;
    }
    // 2) Calcular distinct orderIDs, distinct products, sum of quantity
    const distinctOrders = new Set();
    const distinctProducts = new Set();
    let totalItems = 0;

    for (const rp of roundProds) {
      distinctOrders.add(rp.orderID);
      distinctProducts.add(rp.orderProductID);

      // Buscar la "quantity" en order_product
      const row = await PickingRepository.getOrderProduct(rp.orderProductID);
      if (row) {
        totalItems += row.quantity;
      }
    }

    const ordersCount = distinctOrders.size;
    const productsCount = distinctProducts.size;
    const itemsCount = totalItems;

    // 3) Update la ronda
    await WaveRepository.updateRoundCounts(roundID, ordersCount, productsCount, itemsCount);
  },

};

module.exports = WaveService;
