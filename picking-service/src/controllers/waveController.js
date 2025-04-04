const WaveService = require('../services/waveService');

// 1. Crear ola
exports.createWave = async (req, res) => {
  try {
    const waveData = req.body; 
    const waveID = await WaveService.createWave(waveData);
    res.json({ waveID, message: 'Ola creada con éxito' });
  } catch (error) {
    console.error('❌ Error creando ola:', error);
    res.status(500).json({ message: 'Error interno al crear ola' });
  }
};

// 2. Crear ronda
exports.createRound = async (req, res) => {
  try {
    const { waveID } = req.params;
    const roundData = {
      waveID,
      pickingPoint: req.body.pickingPoint,
      pickerName: req.body.pickerName,
      pickerEmail: req.body.pickerEmail,
      ordersCount: req.body.ordersCount,
      productsCount: req.body.productsCount,
      itemsCount: req.body.itemsCount,
      missingItems: req.body.missingItems,
      isCompleted: req.body.isCompleted,
      roundStatus: req.body.roundStatus
    };
    const roundID = await WaveService.createRound(roundData);
    res.json({ roundID, message: 'Ronda creada con éxito' });
  } catch (error) {
    console.error('❌ Error creando ronda:', error);
    res.status(500).json({ message: 'Error interno al crear ronda' });
  }
};

// 3. Asignar productos a la ronda
exports.assignProductsToRound = async (req, res) => {
  try {
    const { waveID, roundID } = req.params;
    const { products } = req.body; 
    // products = [ { orderID: 123, orderProductID: 555 }, ... ]
    await WaveService.assignProductsToRound(roundID, products);
    res.json({ message: 'Productos asignados a la ronda correctamente' });
  } catch (error) {
    console.error('❌ Error asignando productos a la ronda:', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

// 4. Actualizar estado de la ola (opcional)
exports.updateWaveStatus = async (req, res) => {
  try {
    const { waveID } = req.params;
    const { newStatus } = req.body;
    await WaveService.updateWaveStatus(waveID, newStatus);
    res.json({ message: `Estado de la ola ${waveID} actualizado a ${newStatus}` });
  } catch (error) {
    console.error('❌ Error actualizando ola:', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

// 5. Actualizar estado de la ronda (opcional)
exports.updateRoundStatus = async (req, res) => {
  try {
    const { waveID, roundID } = req.params;
    const { newStatus } = req.body;
    await WaveService.updateRoundStatus(roundID, newStatus);
    res.json({ message: `Estado de la ronda ${roundID} actualizado a ${newStatus}` });
  } catch (error) {
    console.error('❌ Error actualizando ronda:', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

exports.getWaves = async (req, res) => {
  try {
    const waves = await WaveService.getWaves();
    res.json(waves);
  } catch (error) {
    console.error('❌ Error obteniendo olas:', error);
    res.status(500).json({ message: 'Error interno al obtener olas' });
  }
};
exports.getRounds = async (req, res) => {
  try {
    const waves = await WaveService.getRounds();
    res.json(waves);
  } catch (error) {
    console.error('❌ Error obteniendo olas:', error);
    res.status(500).json({ message: 'Error interno al obtener olas' });
  }
};

// Obtener una ola por ID
exports.getWaveById = async (req, res) => {
  try {
    const { waveID } = req.params;
    const wave = await WaveService.getWaveById(waveID);
    if (!wave) {
      return res.status(404).json({ message: 'Ola no encontrada' });
    }
    res.json(wave);
  } catch (error) {
    console.error('❌ Error obteniendo ola:', error);
    res.status(500).json({ message: 'Error interno al obtener ola' });
  }
};

// Obtener todas las rondas de una ola
exports.getRoundsByWave = async (req, res) => {
  try {
    const { waveID } = req.params;
    const rounds = await WaveService.getRoundsByWave(waveID);
    res.json(rounds);
  } catch (error) {
    console.error('❌ Error obteniendo rondas:', error);
    res.status(500).json({ message: 'Error interno al obtener rondas' });
  }
};

// Obtener una ronda en particular
exports.getRoundById = async (req, res) => {
  try {
    const { waveID, roundID } = req.params;
    const round = await WaveService.getRoundById(waveID, roundID);
    if (!round) {
      return res.status(404).json({ message: 'Ronda no encontrada' });
    }
    res.json(round);
  } catch (error) {
    console.error('❌ Error obteniendo ronda:', error);
    res.status(500).json({ message: 'Error interno al obtener ronda' });
  }
};

exports.createRoundAndAssign = async (req, res) => {
  try {
    const { waveID } = req.params;
    const { roundData, products } = req.body;

    // 1) Crear la ronda con 0 en ordersCount/productsCount/itemsCount (temporal)
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

    // 2) Unificar la lógica de asignar
    const result = await WaveService.assignProductsAndPickersNoOrderID(waveID, roundID, products);
    if (!result) {
      return res.status(400).json({
        message: "No se asignaron productos (o no estaban pendientes)."
      });
    }
    const { newStatus, oldStatus } = result;

    // 3) Calcular ordersCount, productsCount, itemsCount
    await WaveService.updateRoundCounts(roundID);

    // 4) Construir un mensaje final
    const statusMessage =
      newStatus === 3
        ? "Todos los productos tienen pickers asignados. Estado: En Picking"
        : "Algunos productos aún no tienen pickers asignados. Estado: Asignando Pickers";

    return res.json({
      roundID,
      message: "Ronda creada y productos/pickers asignados con éxito",
      status: newStatus,
      oldStatus,
      statusMessage
    });
  } catch (error) {
    console.error("❌ Error creando ronda y asignando productos/pickers:", error);
    return res.status(500).json({
      message: "Error interno en createRoundAndAssign",
      error: error.message
    });
  }
};