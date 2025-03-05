const pool = require("../config/db");

const OrdersRepository = {
  getAllOrders: async () => {
    const [orders] = await pool.query("SELECT * FROM Orders");
    return orders;
  },
  getOrdersAudit: async () => {
    const [orders] = await pool.query(
      "SELECT * FROM Orders WHERE orderstatusid = 6"
    );
    return orders;
  },
  getOrdersByIDs: async (idsArray) => {
    if (idsArray.length === 0) return [];

    const [rows] = await pool.query(
      `
      SELECT 
        orderID, 
        folionum, 
        cardname
      FROM orders
      WHERE orderID IN (?)
      `,
      [idsArray]
    );

    return rows;
  },

  getOrderById: async (orderID) => {
    const [order] = await pool.query("SELECT * FROM Orders WHERE orderID = ?", [
      orderID,
    ]);
    return order.length ? order[0] : null;
  },
  getHistory: async (orderID) => {
    const [order] = await pool.query(
      `
      SELECT 
        h.historyID,
        h.orderID,
        h.orderStatusID,
        os1.statusname AS currentStatus,
        h.previousStatusID,
        os2.statusname AS previousStatus,
        h.changeDate,
        h.isCompleted
    FROM orders_service_db.order_status_history h
    LEFT JOIN orders_service_db.order_status os1 
          ON h.orderStatusID = os1.orderstatusid
    LEFT JOIN orders_service_db.order_status os2 
          ON h.previousStatusID = os2.orderstatusid
    WHERE h.orderID = ?;

      `,
      [orderID]
    );
    return order;
  },

  updateOrderStatus: async (orderID, orderStatusID) => {
    const [result] = await pool.query(
      "UPDATE Orders SET orderStatusID = ? WHERE orderID = ?",
      [orderStatusID, orderID]
    );
    return result.affectedRows > 0;
  },

  createOrder: async (orderData) => {
    const [result] = await pool.query("INSERT INTO Orders SET ?", orderData);
    return result.insertId;
  },

  // Verificar si una orden está completa
  isOrderComplete: async (orderID) => {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) as pending 
      FROM Order_Product
      WHERE orderID = ?
        AND pickingStatusID != (
          SELECT pickingStatusID 
          FROM Picking_Status 
          WHERE statusName = 'Completado'
        )
    `,
      [orderID]
    );
    return rows[0].pending === 0;
  },


  getMaxCreatets: async () => {
    const [rows] = await pool.query(`
      SELECT MAX(createts) AS createts FROM Orders
    `);
    console.log("🔎 Query ejecutada: ", rows);
    // Devuelve "000000" si no hay registros
    return rows[0]?.createts || "000000";
  },

  getLastQueryDate: async () => {
    const [rows] = await pool.query(`
      SELECT MAX(lastquerydate) as lastquerydate FROM Orders 
    `);
    console.log("🔎 Query ejecutada: ", rows);
    // Devuelve "000000" si no hay registros
    return rows[0]?.lastquerydate;
  },
};

module.exports = OrdersRepository;
