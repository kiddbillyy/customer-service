const WaveRepository = require('../models/waveRepository');
const PickingRepository = require('../models/pickingRepository')
const { sendMessage } = require("../producer");
const axios = require("axios");

const ORDERS_SERVICE_URL = "http://orders-service:5000/api/orders";

const WaveService = {
  async createWave(waveData) {
    // Se crea la ola sin preocuparse del bloqueo
    const waveID = await WaveRepository.createWave(waveData);
    return waveID;
  },

  createRound: async (roundData) => {
    // 0) Revisamos que la ola exista (se elimina la verificación de bloqueo)
    const wave = await WaveRepository.getWaveById(roundData.waveID);
    if (!wave) {
      throw new Error("No existe la ola con ID=" + roundData.waveID);
    }
  
    // 1) Crear la ronda
    const roundID = await WaveRepository.createRound(roundData);
  
    // 2) Retornar el ID de la nueva ronda
    return roundID;
  },

  async assignProductsToRound(roundID, products) {
    // products = [ { orderID, orderProductID }, ... ]
    await WaveRepository.assignProductsToRound(roundID, products);
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

  // Obtener una ola por ID
  async getWaveById(waveID) {
    return await WaveRepository.getWaveById(waveID);
  },

  // Obtener todas las rondas de una ola
  async getRoundsByWave(waveID) {
    return await WaveRepository.getRoundsByWaveId(waveID);
  },

  // Obtener una ronda por ID (opcionalmente verificando que pertenezca a la ola)
  async getRoundById(waveID, roundID) {
    const round = await WaveRepository.getRoundById(roundID);
    if (round && round.waveID == waveID) {
      return round;
    }
    return null;
  },

  async assignProductsAndPickersNoOrderID(waveID, roundID, products) {
    let oldStatus = null;
    let firstOrderID = null;
    const itemDetails = [];

    for (const { orderProductID, pickerRUT } of products) {
      const row = await PickingRepository.getOrderProductAndOrderID(orderProductID);
      if (!row) continue;

      const { orderID, quantity } = row;
      itemDetails.push({ orderProductID, pickerRUT, orderID, quantity });

      // Insertar en picking_round_products
      await WaveRepository.upsertRoundProduct(roundID, orderID, orderProductID);

      if (firstOrderID == null) {
        firstOrderID = orderID;
      }
    }

    if (itemDetails.length === 0) {
      return false;
    }

    if (firstOrderID) {
      try {
        const response = await axios.get(`${ORDERS_SERVICE_URL}/${firstOrderID}`);
        oldStatus = response.data.orderStatusID;
      } catch (error) {
        console.error(`❌ Error obteniendo estado de la orden ${firstOrderID} desde orders-service:`, error.message);
      }
    }

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
      const status = await PickingRepository.assignPickersToProductsLeftover(
        parseInt(anOrderID, 10),
        groupAssignments
      );
      if (status === 3) {
        finalStatus = 3;
      }
    }

    if (oldStatus != null && finalStatus !== false && oldStatus != finalStatus && firstOrderID) {
      await sendMessage("order.status.updated", { orderID: firstOrderID, newStatus: finalStatus });
      console.log(`📤 Estado de la orden ${firstOrderID} actualizado a ${finalStatus}`);
    }

    return { newStatus: finalStatus, oldStatus };
  },

  async updateRoundCounts(roundID) {
    const roundProds = await WaveRepository.getRoundProducts(roundID);
    if (!roundProds || roundProds.length === 0) {
      await WaveRepository.updateRoundCounts(roundID, 0, 0, 0);
      return;
    }
    const distinctOrders = new Set();
    const distinctProducts = new Set();
    let totalItems = 0;

    for (const rp of roundProds) {
      distinctOrders.add(rp.orderID);
      distinctProducts.add(rp.orderProductID);

      const row = await PickingRepository.getOrderProduct(rp.orderProductID);
      if (row) {
        totalItems += row.quantity;
      }
    }

    const ordersCount = distinctOrders.size;
    const productsCount = distinctProducts.size;
    const itemsCount = totalItems;
    await WaveRepository.updateRoundCounts(roundID, ordersCount, productsCount, itemsCount);
  },

  checkAndUpdateRoundStatus: async (roundID) =>  {
    const roundProducts = await WaveRepository.getRoundProducts(roundID);
    if (!roundProducts || roundProducts.length === 0) {
      return;
    }
  
    let hasStarted = false;
    let allAreComplete = true;
  
    for (const rp of roundProducts) {
      const assignments = await PickingRepository.getAssignmentsByOrderProduct(rp.orderProductID);
      if (!assignments || assignments.length === 0) {
        allAreComplete = false;
        continue;
      }
  
      let productIsCompletelyPicked = true;
      let productHasStartedSomething = false;
  
      for (const asg of assignments) {
        if (asg.pickingStatusID >= 2) {
          productHasStartedSomething = true;
        }
        if (asg.pickingStatusID !== 3) {
          productIsCompletelyPicked = false;
        }
      }
  
      if (productHasStartedSomething) {
        hasStarted = true;
      }
  
      if (!productIsCompletelyPicked) {
        allAreComplete = false;
      }
    }
  
    let newStatus;
    if (allAreComplete) {
      newStatus = "Finalizada";
    } else if (hasStarted) {
      newStatus = "En curso";
    } else {
      newStatus = "Pendiente";
    }
  
    const round = await WaveRepository.getRoundById(roundID);
    if (round && round.roundStatus !== newStatus) {
      await WaveRepository.updateRoundStatus(roundID, newStatus);
      console.log(`▶️ [roundID=${roundID}] estado actualizado a ${newStatus}`);
    }
  },

  async createRoundAndAssign({ waveID, roundData, products }) {
    const wave = await WaveRepository.getWaveById(waveID);
    if (!wave) {
      throw new Error(`No existe la ola con ID=${waveID}`);
    }

    // Se elimina la validación de topes para pedidos o ítems
    const roundID = await WaveService.createRound({
      waveID,
      pickingPoint: roundData.pickingPoint,
      pickerName: roundData.pickerName,
      pickerEmail: roundData.pickerEmail,
      ordersCount: 0,
      productsCount: 0,
      itemsCount: 0,
      missingItems: 0,
      isCompleted: 0,
      roundStatus: "Pendiente"
    });

    const result = await WaveService.assignProductsAndPickersNoOrderID(waveID, roundID, products);
    if (!result) {
      throw new Error("No se asignaron productos (o no estaban pendientes).");
    }

    await WaveService.updateRoundCounts(roundID);

    // Se actualizan los conteos de la ola sin verificar topes ni bloquear la ola
    await WaveService.updateWaveCounts(waveID);

    const { newStatus, oldStatus } = result;
    return {
      roundID,
      newStatus,
      oldStatus,
      statusMessage: (newStatus === 3)
         ? "Todos los productos tienen pickers asignados. Estado: En Picking"
         : "Algunos productos aún no tienen pickers asignados. Estado: Asignando Pickers"
    };
  },

  updateWaveCounts: async (waveID) =>  {
    const { totalOrders, totalItems } = await WaveRepository.sumRoundsInWave(waveID);
    // Actualizar la ola con los nuevos conteos
    await WaveRepository.updateWaveCounts(waveID, totalOrders, totalItems);
    // Se eliminó la lógica que bloquea la ola cuando se alcanzan ciertos topes
  },

  calculateRoundTotalsForAssignment: async (products) =>  {
    const distinctOrderIDs = new Set();
    let totalItems = 0;
  
    for (const { orderProductID } of products) {
      const row = await PickingRepository.getOrderProductAndOrderID(orderProductID);
      if (!row) continue;
      distinctOrderIDs.add(row.orderID);
      totalItems += row.quantity;
    }
  
    const ordersCount = distinctOrderIDs.size;
    return { ordersCount, itemsCount: totalItems };
  }
};

module.exports = WaveService;
