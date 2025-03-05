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
      // Obtener la cantidad total del producto
      const [prodRows] = await pool.query(
        `SELECT quantity FROM Order_Product WHERE orderProductID = ?`,
        [orderProductID]
      );
      if (!prodRows || prodRows.length === 0) continue;
      const totalQuantity = prodRows[0].quantity;
  
      // Verificar si el producto ya tiene asignación en Order_Product_Picker
      const [existing] = await pool.query(
        `
        SELECT orderProductPickerID 
        FROM Order_Product_Picker
        WHERE orderProductID = ?
        `,
        [orderProductID]
      );
  
      // Si no existe, insertar la asignación inicial con assignedQuantity = totalQuantity
      if (existing.length === 0) {
        await pool.query(
          `
          INSERT INTO Order_Product_Picker 
            (orderProductID, pickerRUT, pickingStatusID, pickedQuantity, assignedQuantity)
          VALUES (?, ?, 2, 0, ?)
          `,
          [orderProductID, pickerRUT, totalQuantity]
        );
      } else {
        // Si ya existe, opcionalmente se puede actualizar el picker y asignar el total
        await pool.query(
          `
          UPDATE Order_Product_Picker 
          SET pickerRUT = ?, assignedAt = NOW(), assignedQuantity = ?
          WHERE orderProductID = ?
          `,
          [pickerRUT, totalQuantity, orderProductID]
        );
      }
  
      // Actualizar el estado de picking del producto en Order_Product
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
        COALESCE(opp.assignedQuantity, op.quantity) AS assignedQuantity,
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
      WHERE opp.pickerRUT = ?`
    ,
      [pickerRUT]
    );
    return products.length ? products : null;
  },

  updatePickedProduct: async (orderProductID, quantityToAdd, itemcode, pickerRUT) => {
    // Actualización en Order_Product (progreso global)
    const [resultOrderProduct] = await pool.query(
      `
      UPDATE Order_Product
      SET 
        pickedQuantity = CASE
          WHEN pickedQuantity + ? >= quantity THEN quantity
          ELSE pickedQuantity + ?
        END,
        pickingStatusID = CASE
          WHEN pickedQuantity + ? >= quantity THEN 3
          ELSE 2
        END
      WHERE orderProductID = ?
        AND itemcode = ?
      `,
      [quantityToAdd, quantityToAdd, quantityToAdd, orderProductID, itemcode]
    );
  
    // Actualización en order_product_picker (solo para el picker indicado)
    const [resultOrderProductPicker] = await pool.query(
      `
      UPDATE order_product_picker AS opp
      JOIN Order_Product AS op ON opp.orderProductID = op.orderProductID
      SET
        opp.pickedQuantity = CASE
          WHEN opp.pickedQuantity + ? >= op.quantity THEN op.quantity
          ELSE opp.pickedQuantity + ?
        END,
        opp.pickingStatusID = CASE
          WHEN opp.pickedQuantity + ? >= op.quantity THEN 3
          ELSE 2
        END
      WHERE opp.orderProductID = ?
        AND opp.pickerRUT = ?
      `,
      [quantityToAdd, quantityToAdd, quantityToAdd, orderProductID, pickerRUT]
    );
  
    // Retorna true si al menos se actualizó Order_Product
    return resultOrderProduct.affectedRows > 0;
  },
  
  
  
  

  isPickingComplete: async (orderID) => {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) as pending
      FROM Order_Product
      WHERE orderID = ?
        AND pickingStatusID != 3`
    ,
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
        AND pickedQuantity < quantity`
    ,
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
        )`
    ,
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
        AND pickingStatusID != 3`
    ,
      [orderID]
    );
    return result[0].pending === 0;
  },
  getOrderProduct: async (orderProductID) => {
    const [rows] = await pool.query(
      `
      SELECT orderProductID, itemcode, quantity, pickedQuantity
      FROM Order_Product
      WHERE orderProductID = ?`
      ,
      [orderProductID]
    );
    return rows[0];
  },  
  // Obtener la asignación actual en order_product_picker
  getOrderProductPicker: async (orderProductID) => {
    const [rows] = await pool.query(
      `SELECT * FROM order_product_picker WHERE orderProductID = ?`,
      [orderProductID]
    );

    return rows[0];
  },
  // Registrar la reasignación
  recordPickerReassignment: async ({ orderProductID, oldPicker, newPicker, reason }) => {
    const [result] = await pool.query(
      `INSERT INTO picker_reassignments (orderProductID, oldPicker, newPicker, reason)
       VALUES (?, ?, ?, ?)`,
      [orderProductID, oldPicker, newPicker, reason]
    );
    return result.insertId;
  },
  createAdditionalAssignment: async (orderProductID, newPicker, assignedQuantity) => {
    const [result] = await pool.query(
      `
      INSERT INTO order_product_picker 
        (orderProductID, pickerRUT, pickingStatusID, pickedQuantity, assignedQuantity)
      VALUES (?, ?, 2, 0, ?)
      `,
      [orderProductID, newPicker, assignedQuantity]
    );
    return result.insertId;
  },
  
  
  // Actualizar la asignación en order_product_picker para reasignar el producto
  reassignProductPicker: async (orderProductID, newPicker, assignedQuantity) => {
    // Actualizamos la asignación actual para reflejar el nuevo picker.
    // Opcionalmente, podrías crear un nuevo registro en vez de actualizar el existente.
    const [result] = await pool.query(
      `
      UPDATE order_product_picker
      SET pickerRUT = ?,
          pickingStatusID = 2
      WHERE orderProductID = ?
      `,
      [newPicker, orderProductID]
    );
    return result.affectedRows > 0;
  },
  updateAssignmentAssignedQuantity: async (orderProductID, pickerRUT, newAssignedQuantity) => {
    const [result] = await pool.query(
      `
      UPDATE order_product_picker
      SET assignedQuantity = ?
      WHERE orderProductID = ? AND pickerRUT = ?
      `,
      [newAssignedQuantity, orderProductID, pickerRUT]
    );
    return result.affectedRows > 0;
  },
};
module.exports = PickingRepository;
