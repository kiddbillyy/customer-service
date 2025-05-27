const pool = require("../config/db");

const OrdersRepository = {
  getAllOrders: async () => {
    const [orders] = await pool.query("SELECT * FROM orders_service_db.Orders");
    return orders;
  },
  getOrdersAudit: async () => {
    const [orders] = await pool.query(
      "SELECT * FROM orders_service_db.Orders WHERE orderstatusid = 6"
    );
    return orders;
  },
  getOrdersByIDs: async (idsArray) => {
    if (idsArray.length === 0) return [];
  
    // Crear placeholders: "?, ?, ?" según la cantidad de elementos
    const placeholders = idsArray.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `
        SELECT 
          orderID, 
          folionum, 
          cardname
        FROM orders_service_db.orders
        WHERE orderID IN (${placeholders})
      `,
      idsArray
    );
  
    return rows;
  },

  getOrderById: async (orderID) => {
    const [order] = await pool.query("SELECT * FROM orders_service_db.Orders WHERE orderID = ?", [
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
      "UPDATE orders_service_db.Orders SET orderStatusID = ? WHERE orderID = ?",
      [orderStatusID, orderID]
    );
    return result.rowsAffected[0] > 0;
  },

  // Verificar si una orden está completa
  isOrderComplete: async (orderID) => {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) as pending 
      FROM orders_service_db.Order_Product
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
      SELECT MAX(createts) AS createts FROM orders_service_db.Orders
    `);
    console.log("🔎 Query ejecutada: ", rows);
    // Devuelve "000000" si no hay registros
    return rows[0]?.createts || "000000";
  },

  getLastQueryDate: async () => {
    const [rows] = await pool.query(`
      SELECT MAX(lastquerydate) as lastquerydate FROM orders_service_db.Orders 
    `);
    console.log("🔎 Query ejecutada: ", rows);
    // Devuelve "000000" si no hay registros
    return rows[0]?.lastquerydate;
  },

  async ingestVtexOrder(vtex) {
    const [exist] = await pool.query(
      "SELECT TOP 1 orderID FROM orders_service_db.Orders WHERE u_ref1 = ?",
      [vtex.u_ref1]
    );
    const isNew = exist.length === 0;

    await pool.query(
      `
      MERGE orders_service_db.Orders AS target
      USING (SELECT ? AS u_ref1) AS src
        ON target.u_ref1 = src.u_ref1

      WHEN MATCHED THEN
        UPDATE SET
          cardcode           = ?, 
          cardname           = ?, 
          phone1             = ?, 
          e_mail             = ?, 
          itemsAmount        = ?,
          doctotalsy         = ?, 
          orderStatusID      = ?, 
          INTEGRATION_STATUS = ?

      WHEN NOT MATCHED THEN
        INSERT (
          cardcode, cardname, phone1, e_mail, u_ref1, itemsAmount,
          doctotalsy, orderStatusID, INTEGRATION_STATUS, createdate
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          -- createdate como string nvarchar(255):
          CONVERT(nvarchar(255), GETDATE(), 120)
        );
      `,
      [
        // src.u_ref1
        vtex.u_ref1,

        // UPDATE params
        vtex.cardcode,
        vtex.cardname,
        vtex.phone1,
        vtex.e_mail,
        vtex.itemsamount,
        vtex.doctotalsy,
        vtex.orderStatusID,
        vtex.integrationStatus,

        // INSERT params
        vtex.cardcode,
        vtex.cardname,
        vtex.phone1,
        vtex.e_mail,
        vtex.u_ref1,
        vtex.itemsamount,
        vtex.doctotalsy,
        vtex.orderStatusID,
        vtex.integrationStatus
      ]
    );

    const [rows] = await pool.query(
      "SELECT * FROM orders_service_db.Orders WHERE u_ref1 = ?",
      [vtex.u_ref1]
    );
    return { orderRow: rows[0], isNew };
  },

  getInscription: async (codigo) => {
    const [rows] = await pool.query(
      `SELECT Nombre
         FROM orders_service_db.dbo.giro
        WHERE Codigo = ?`,
      [codigo]
    );

    console.log("🔎 getInscription ejecutada:", rows);
    return rows[0]?.Nombre ?? null;
  },
  saveSapIds: async (orderId, docEntry, docNum) => {
    await pool.query(
      `UPDATE orders_service_db.Orders
         SET docentry = ?, docnum = ?, INTEGRATION_STATUS = 'sent-to-sap'
       WHERE orderID = ?`,
      [docEntry, docNum, orderId]
    );
  },
  saveSapPaymentIds: async (orderID, payDocEntry, payDocNum) => {
    await pool.query(`
      UPDATE orders_service_db.Orders
      SET payDocEntry = ?, payDocNum = ?
      WHERE orderID = ?;
    `, [payDocEntry, payDocNum, orderID]);
  },
  saveIntegrationError: async (orderId, errorMsg) => {
  await pool.query(
    `UPDATE orders_service_db.Orders
        SET integrationError = ?
      WHERE u_ref1 = ?`,
    [errorMsg, orderId]
  );
  },

};

module.exports = OrdersRepository;
