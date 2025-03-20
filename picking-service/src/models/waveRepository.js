const pool = require('../config/db');

const WaveRepository = {
  // 1. Crear Ola
  async createWave(waveData) {
    const sql = `
      INSERT INTO picking_waves (
        pickingPoint, startDate, endDate, 
        ordersPlanned, ordersPicked, itemsPlanned, itemsPicked,
        isBlocked, waveStatus
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const {
      pickingPoint, startDate, endDate,
      ordersPlanned, ordersPicked,
      itemsPlanned, itemsPicked,
      isBlocked, waveStatus
    } = waveData;

    const [result] = await pool.query(sql, [
      pickingPoint,
      startDate,
      endDate,
      ordersPlanned || 0,
      ordersPicked || 0,
      itemsPlanned || 0,
      itemsPicked || 0,
      isBlocked || 0,
      waveStatus || 'Pendiente'
    ]);
    return result.insertId;
  },

  // 2. Crear Ronda
  async createRound(roundData) {
    const sql = `
      INSERT INTO picking_rounds (
        waveID, pickingPoint, pickerName, pickerEmail, 
        ordersCount, productsCount, itemsCount, missingItems,
        isCompleted, roundStatus
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(sql, [
      roundData.waveID,
      roundData.pickingPoint,
      roundData.pickerName,
      roundData.pickerEmail,
      roundData.ordersCount || 0,
      roundData.productsCount || 0,
      roundData.itemsCount || 0,
      roundData.missingItems || 0,
      roundData.isCompleted || 0,
      roundData.roundStatus || 'Pendiente'
    ]);
    return result.insertId;
  },

  // 3. Asignar productos (o un subset de productos) a la ronda
  async assignProductsToRound(roundID, products) {
    // products: array de { orderID, orderProductID }
    const sql = `
      INSERT INTO picking_round_products (roundID, orderID, orderProductID) 
      VALUES (?, ?, ?)
    `;
    for (const p of products) {
      await pool.query(sql, [roundID, p.orderID, p.orderProductID]);
    }
  },

  // 4. Actualizar el estado de la ola (opcional)
  async updateWaveStatus(waveID, newStatus) {
    const sql = `UPDATE picking_waves SET waveStatus=? WHERE waveID=?`;
    await pool.query(sql, [newStatus, waveID]);
  },

  // 5. Actualizar el estado de la ronda (opcional)
  async updateRoundStatus(roundID, newStatus) {
    const sql = `UPDATE picking_rounds SET roundStatus=? WHERE roundID=?`;
    await pool.query(sql, [newStatus, roundID]);
  },
  async upsertRoundProduct(roundID, orderID, orderProductID) {
    // Insertar si no existe (ON DUPLICATE KEY nada)
    const sql = `
      INSERT INTO picking_round_products (roundID, orderID, orderProductID)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE roundID=roundID
    `;
    await pool.query(sql, [roundID, orderID, orderProductID]);
  },
  async getWaves() {
    const sql = `SELECT * FROM picking_waves`;
    const [rows] = await pool.query(sql);
    return rows;
  },
  async getRounds() {
    const sql = `SELECT * FROM picking_rounds`;
    const [rows] = await pool.query(sql);
    return rows;
  },

  // Obtener una ola por ID
  async getWaveById(waveID) {
    const sql = `SELECT * FROM picking_waves WHERE waveID = ?`;
    const [rows] = await pool.query(sql, [waveID]);
    return rows[0];
  },

  // Obtener todas las rondas de una ola
  async getRoundsByWaveId(waveID) {
    const sql = `SELECT * FROM picking_rounds WHERE waveID = ?`;
    const [rows] = await pool.query(sql, [waveID]);
    return rows;
  },

  // Obtener una ronda por su ID
  async getRoundById(roundID) {
    const sql = `SELECT * FROM picking_rounds WHERE roundID = ?`;
    const [rows] = await pool.query(sql, [roundID]);
    return rows[0];
  },

};

module.exports = WaveRepository;
