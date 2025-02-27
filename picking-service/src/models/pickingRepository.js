const pool = require("../config/db");

const PickingRepository = {
  assignPickers: async (orderID, pickerAssignments) => {
    const [products] = await pool.query(
      `
      SELECT orderProductID 
      FROM Order_Product
      WHERE orderID = ?
        AND (pickingStatusID = 1 OR pickingStatusID = 2)
    `,
      [orderID]
    );

    if (products.length === 0) return false;

    for (let { orderProductID, pickerRUT } of pickerAssignments) {
      // Verificar si el producto ya tiene un picker asignado
      const [existing] = await pool.query(
        `
        SELECT orderProductPickerID 
        FROM Order_Product_Picker
        WHERE orderProductID = ?
      `,
        [orderProductID]
      );

      if (existing.length > 0) {
        // Actualizar el picker asignado
        await pool.query(
          `
          UPDATE Order_Product_Picker 
          SET pickerRUT = ?, assignedAt = NOW()
          WHERE orderProductID = ?
        `,
          [pickerRUT, orderProductID]
        );
      } else {
        // Insertar nueva asignación
        await pool.query(
          `
          INSERT INTO Order_Product_Picker (orderProductID, pickerRUT, pickingStatusID)
          VALUES (?, ?, 2)
        `,
          [orderProductID, pickerRUT]
        );
      }

      // Actualizar el estado de picking del producto en `Order_Product`
      await pool.query(
        `
        UPDATE Order_Product
        SET pickingStatusID = 2
        WHERE orderProductID = ?
      `,
        [orderProductID]
      );
    }

    // Verificar si TODOS los productos de la orden tienen pickers asignados
    const allAssigned = await PickingRepository.isAllProductsAssigned(orderID);
    return allAssigned ? 3 : 2;
  },

  getProductsFromOrder: async (orderID) => {
    const [products] = await pool.query(
      `SELECT op.orderProductID, op.orderID, op.itemcode, 
      p.dscription, p.price ,op.quantity, op.pickedQuantity, op.pickingStatusID, (op.quantity * p.price) as total
      FROM order_product op
      join products p on (p.itemcode = op.itemcode)
      WHERE orderID = ?`,
      [orderID]
    );
    return products.length ? products : null;
  },

  getStatuses: async () => {
    const [rows] = await pool.query(
      `SELECT pickingStatusID, statusName FROM picking_status`
    );
    return rows;
  },

  getProductsAssignedToPicker: async (pickerRUT) => {
    const [products] = await pool.query(
      `
      SELECT 
        opp.orderProductPickerID AS ID,
        opp.pickerRUT AS Pickeador,
        opp.pickingStatusID AS pickingStatusID,
        opp.pickedQuantity AS CantidadPickeada,
        opp.assignedAt AS Inicio_Picking,
        op.orderProductID,
        op.orderID,
        op.itemcode,
        p.dscription,
        p.price,
        op.quantity,
        (op.quantity * p.price) AS total
      FROM order_product_picker opp
      JOIN order_product op ON opp.orderProductID = op.orderProductID
      JOIN products p ON op.itemcode = p.itemcode
      WHERE opp.pickerRUT = ?
    `,
      [pickerRUT]
    );
    return products.length ? products : null;
  },

  getProductsAssignedFromOrder: async (pickerRUT) => {
    const [products] = await pool.query(
      `
      SELECT 
        opp.orderProductPickerID AS ID,
        opp.pickerRUT AS Pickeador,
        opp.pickingStatusID AS Estado,
        opp.pickedQuantity AS CantidadPickeada,
        opp.assignedAt AS Inicio_Picking,
        op.orderProductID,
        op.orderID,
        op.itemcode,
        p.dscription,
        p.price,
        op.quantity,
        (op.quantity * p.price) AS total
      FROM order_product_picker opp
      JOIN order_product op ON opp.orderProductID = op.orderProductID
      JOIN products p ON op.itemcode = p.itemcode
      WHERE opp.pickerRUT = ?
    `,
      [pickerRUT]
    );
    return products.length ? products : null;
  },

  updatePickedProduct: async (orderProductID, pickedQuantity) => {
    const [result] = await pool.query(
      `
      UPDATE Order_Product
      SET pickedQuantity = pickedQuantity + ?,
          pickingStatusID = CASE 
            WHEN pickedQuantity + ? >= quantity THEN 3
            ELSE 2
          END
      WHERE orderProductID = ?
        AND pickingStatusID != 3
    `,
      [pickedQuantity, pickedQuantity, orderProductID]
    );

    return result.affectedRows > 0;
  },

  isPickingComplete: async (orderID) => {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) as pending
      FROM Order_Product
      WHERE orderID = ?
        AND pickingStatusID != 3
    `,
      [orderID]
    );
    return rows[0].pending === 0;
  },

  hasMissingProducts: async (orderID) => {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) as missing
      FROM Order_Product
      WHERE orderID = ?
        AND pickedQuantity < quantity
    `,
      [orderID]
    );
    return rows[0].missing > 0;
  },

  isAllProductsAssigned: async (orderID) => {
    const [result] = await pool.query(
      `
      SELECT COUNT(*) as unassigned
      FROM Order_Product
      WHERE orderID = ?
        AND orderProductID NOT IN (
          SELECT orderProductID FROM Order_Product_Picker
        )
    `,
      [orderID]
    );
    return result[0].unassigned === 0;
  },

  isOrderFullyPicked: async (orderID) => {
    const [result] = await pool.query(
      `
      SELECT COUNT(*) as pending
      FROM Order_Product
      WHERE orderID = ?
        AND pickingStatusID != 3
    `,
      [orderID]
    );
    return result[0].pending === 0;
  },
};
module.exports = PickingRepository;
