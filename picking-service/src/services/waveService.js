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
    // roundData = { waveID, pickingPoint, pickerName, ... }
    const roundID = await WaveRepository.createRound(roundData);
    return roundID;
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

};

module.exports = WaveService;
