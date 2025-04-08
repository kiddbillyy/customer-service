const pool = require('../config/db');

const WaveRepository = {
  // 1. Crear Ola
  async createWave(waveData) {
    const sql = `
      INSERT INTO picking_service_db.picking_waves (
        pickingPoint, startDate, endDate, 
        ordersPlanned, ordersPicked, itemsPlanned, itemsPicked,
        isBlocked, waveStatus
      ) 
      OUTPUT INSERTED.waveID
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
    return result[0].waveID;
  },
  findRoundsByOrderProductID: async (orderProductID) =>  {
    const [rows] = await pool.query(`
      SELECT roundID
      FROM picking_service_db.picking_round_products
      WHERE orderProductID = ?
    `, [orderProductID]);
    return rows;  // Devuelve un array de { roundID: X }
  },

  // 2. Crear Ronda
  async createRound(roundData) {
    const sql = `
      INSERT INTO picking_service_db.picking_rounds (
        waveID, pickingPoint, pickerName, pickerEmail, 
        ordersCount, productsCount, itemsCount, missingItems,
        isCompleted, roundStatus
      ) 
      OUTPUT INSERTED.roundID
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
    return result[0].roundID;
  },
  

  // 3. Asignar productos (o un subset de productos) a la ronda
  async assignProductsToRound(roundID, products) {
    // products: array de { orderID, orderProductID }
    const sql = `
      INSERT INTO picking_service_db.picking_round_products (roundID, orderID, orderProductID) 
      VALUES (?, ?, ?)
    `;
    for (const p of products) {
      await pool.query(sql, [roundID, p.orderID, p.orderProductID]);
    }
  },

  // 4. Actualizar el estado de la ola
  async updateWaveStatus(waveID, newStatus) {
    const sql = `UPDATE picking_service_db.picking_waves SET waveStatus = ? WHERE waveID = ?`;
    await pool.query(sql, [newStatus, waveID]);
  },

  // 5. Actualizar el estado de la ronda
  async updateRoundStatus(roundID, newStatus) {
    const sql = `UPDATE picking_service_db.picking_rounds SET roundStatus = ? WHERE roundID = ?`;
    await pool.query(sql, [newStatus, roundID]);
  },

  // Upsert de producto en la ronda
  async upsertRoundProduct(roundID, orderID, orderProductID) {
    const sql = `
      MERGE picking_service_db.picking_round_products AS target
      USING (VALUES (?, ?, ?)) AS source (roundID, orderID, orderProductID)
      ON target.roundID = source.roundID 
         AND target.orderID = source.orderID 
         AND target.orderProductID = source.orderProductID
      WHEN NOT MATCHED THEN
        INSERT (roundID, orderID, orderProductID)
        VALUES (source.roundID, source.orderID, source.orderProductID);
    `;
    await pool.query(sql, [roundID, orderID, orderProductID]);
  },

  async getWaves() {
    const sql = `SELECT * FROM picking_service_db.picking_waves`;
    const [rows] = await pool.query(sql);
    return rows;
  },

  async getRounds() {
    const sql = `SELECT * FROM picking_service_db.picking_rounds`;
    const [rows] = await pool.query(sql);
    return rows;
  },

  // Obtener una ola por ID
  async getWaveById(waveID) {
    const sql = `SELECT * FROM picking_service_db.picking_waves WHERE waveID = ?`;
    const [rows] = await pool.query(sql, [waveID]);
    return rows[0];
  },

  // Obtener todas las rondas de una ola
  async getRoundsByWaveId(waveID) {
    const sql = `SELECT * FROM picking_service_db.picking_rounds WHERE waveID = ?`;
    const [rows] = await pool.query(sql, [waveID]);
    return rows;
  },

  // Obtener una ronda por su ID
  async getRoundById(roundID) {
    const sql = `SELECT * FROM picking_service_db.picking_rounds WHERE roundID = ?`;
    const [rows] = await pool.query(sql, [roundID]);
    return rows[0];
  },

  // Obtener productos asignados a la ronda
  async getRoundProducts(roundID) {
    const [rows] = await pool.query(`
      SELECT orderProductID, orderID
      FROM picking_service_db.picking_round_products
      WHERE roundID = ?
    `, [roundID]);
    return rows;
  },

  async updateRoundCounts(roundID, ordersCount, productsCount, itemsCount) {
    const sql = `
      UPDATE picking_service_db.picking_rounds
      SET ordersCount = ?,
          productsCount = ?,
          itemsCount = ?
      WHERE roundID = ?
    `;
    await pool.query(sql, [ordersCount, productsCount, itemsCount, roundID]);
  },
  sumRoundsInWave: async (waveID) => {
    const [rows] = await pool.query(`
      SELECT 
        COUNT(*) AS totalOrders,
        ISNULL(SUM(t.totalQuantity), 0) AS totalItems
      FROM (
        SELECT prp.orderID, SUM(op.quantity) AS totalQuantity
        FROM picking_service_db.picking_round_products prp
        JOIN picking_service_db.picking_rounds r ON r.roundID = prp.roundID
        JOIN picking_service_db.order_product op ON op.orderProductID = prp.orderProductID
        WHERE r.waveID = ?
        GROUP BY prp.orderID
      ) t
    `, [waveID]);
    
    // Retorna { totalOrders, totalItems }
    return rows[0] || { totalOrders: 0, totalItems: 0 };
  },
  updateWaveCounts: async (waveID, ordersPicked, itemsPicked) => {
    const sql = `
      UPDATE picking_service_db.picking_waves
      SET ordersPicked = ?, 
          itemsPicked = ?
      WHERE waveID = ?
    `;
    await pool.query(sql, [ordersPicked, itemsPicked, waveID]);
  },
  blockWave: async (waveID) =>  {
    await pool.query(`
      UPDATE picking_service_db.picking_waves
      SET isBlocked = 1
      WHERE waveID = ?
    `, [waveID]);
  },

};

module.exports = WaveRepository;
