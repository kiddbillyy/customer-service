const pool = require("../config/db");

const PickingRepository = {
  
  // 1. Este método inserta (o actualiza) un registro en 'order_picker' para orderID + pickerRUT
  async upsertOrderPicker(orderID, pickerRUT) {
    await pool.query(`
      INSERT INTO order_picker (orderID, pickerRUT, pickingStatusID)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE
        pickingStatusID = pickingStatusID
    `, [orderID, pickerRUT]);
  },

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
      // --> upsert en 'order_picker' para el estado global
      await PickingRepository.upsertOrderPicker(orderID, pickerRUT);

      // 1. Obtener la cantidad total del producto
      const [prodRows] = await pool.query(
        `SELECT quantity FROM Order_Product WHERE orderProductID = ?`,
        [orderProductID]
      );
      if (!prodRows || prodRows.length === 0) continue;
      const totalQuantity = prodRows[0].quantity;

      // 2. Verificar si el producto ya tiene asignación en 'Order_Product_Picker'
      const [existing] = await pool.query(
        `
        SELECT orderProductPickerID 
        FROM Order_Product_Picker
        WHERE orderProductID = ?
        `,
        [orderProductID]
      );

      // 3. Si no existe, insertar la asignación inicial con assignedQuantity = totalQuantity
      if (existing.length === 0) {
        await pool.query(
          `
          INSERT INTO Order_Product_Picker 
            (orderProductID, pickerRUT, pickingStatusID, pickedQuantity, assignedQuantity)
          VALUES (?, ?, 1, 0, ?)
          `,
          [orderProductID, pickerRUT, totalQuantity]
        );
      } else {
        // 4. Si ya existe, opcionalmente se puede actualizar el picker y asignar el total
        await pool.query(
          `
          UPDATE Order_Product_Picker 
          SET pickerRUT = ?, assignedAt = NOW(), assignedQuantity = ?
          WHERE orderProductID = ?
          `,
          [pickerRUT, totalQuantity, orderProductID]
        );
      }

      // 5. Actualizar el estado de picking del producto en 'Order_Product'
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
  
  getProductsByOrder: async (orderID) => {
    const [products] = await pool.query(
      `SELECT orderProductID FROM Order_Product WHERE orderID = ?`,
      [orderID]
    );
    return products; // Devuelve la lista de productos
  },
  
  insertOrUpdateProduct: async ({ itemcode, dscription, price, codebars, whscode, U_Subcategoria   }) => {
    await pool.query(`
      INSERT INTO Products (itemcode, dscription, price, codebars, whscode, U_Subcategoria)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      dscription = VALUES(dscription),
      price = VALUES(price),
      codebars = VALUES(codebars),
      whscode = VALUES(whscode),
      U_Subcategoria = VALUES(U_Subcategoria)

    `, [itemcode, dscription, price, codebars, whscode, U_Subcategoria]);

    console.log(`✅ Producto ${itemcode} actualizado en la BD`);
  },

  insertOrUpdateOrderProduct: async (orderID, { itemcode, quantity }) => {
    await pool.query(`
      INSERT INTO Order_Product (orderID, itemcode, quantity, pickedQuantity, pickingStatusID)
      VALUES (?, ?, ?, 0, 1)
      ON DUPLICATE KEY UPDATE 
      quantity = VALUES(quantity)
    `, [orderID, itemcode, quantity]);

    console.log(`✅ Producto ${itemcode} agregado a Order_Product en orden ${orderID}`);
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
  updateOrderProductPicker: async (bundleID, products) => {
    for (const { orderProductID } of products) {
      await pool.query(`
        UPDATE order_product_picker
        SET bundleID = ?
        WHERE orderProductID = ?
      `, [bundleID, orderProductID]);

      console.log(`✅ order_product_picker actualizado: orderProductID=${orderProductID}, bundleID=${bundleID}`);
    }
  },

  updateStatus: async (orderProductPickerID, pickingStatusID) => {
    const [result] = await pool.query(
      `
      UPDATE order_product_picker
      SET pickingStatusID = ?
      WHERE orderProductPickerID = ?
      `,
      [pickingStatusID, orderProductPickerID]
    );

    return result.affectedRows > 0; // Retorna true si se actualizó
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
        p.codebars,
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
    // 1) Primero, suma a pickedQuantity sin forzar estado a 3 de inmediato.
    const [resultFirst] = await pool.query(`
      UPDATE Order_Product
      SET 
        pickedQuantity = LEAST(pickedQuantity + ?, quantity)
      WHERE orderProductID = ?
        AND itemcode = ?
    `, [quantityToAdd, orderProductID, itemcode]);
  
    if (resultFirst.affectedRows === 0) {
      return false;
    }
  
    // 2) Luego, set pickingStatusID según si pickedQuantity == quantity
    const [resultSecond] = await pool.query(`
      UPDATE Order_Product
      SET 
        pickingStatusID = CASE
          WHEN pickedQuantity >= quantity THEN 3
          ELSE 2
        END
      WHERE orderProductID = ?
        AND itemcode = ?
    `, [orderProductID, itemcode]);
  
    if (resultSecond.affectedRows === 0) {
      return false;
    }
  
    // 3) Repetimos la lógica en order_product_picker
    //    para que orderProductPicker se mantenga sincronizado.
    //    Primero sumamos pickedQuantity
    const [pickerUpdate1] = await pool.query(`
      UPDATE order_product_picker opp
      JOIN Order_Product op ON opp.orderProductID = op.orderProductID
      SET opp.pickedQuantity = LEAST(opp.pickedQuantity + ?, op.quantity)
      WHERE opp.orderProductID = ?
        AND opp.pickerRUT = ?
    `, [quantityToAdd, orderProductID, pickerRUT]);
  
    if (pickerUpdate1.affectedRows === 0) {
      return false;
    }
  
    // 4) Luego asignar pickingStatusID = 3 solo si opp.pickedQuantity >= op.quantity
    const [pickerUpdate2] = await pool.query(`
      UPDATE order_product_picker opp
      JOIN Order_Product op ON opp.orderProductID = op.orderProductID
      SET opp.pickingStatusID = CASE
        WHEN opp.pickedQuantity >= op.quantity THEN 3
        ELSE 2
      END
      WHERE opp.orderProductID = ?
        AND opp.pickerRUT = ?
    `, [orderProductID, pickerRUT]);
  
    return pickerUpdate2.affectedRows > 0;
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

  handleNewBundle: async (msg) => {
    const [result] = await pool.query(
    `UPDATE order_product_picker
      SET bundleID = ?
      where orderProductID = ? and pickerRUT = ?;      
      `,
      [msg.bundleID, msg.products[0].orderProductID, msg.pickerRUT]
    );
    return result.affectedRows > 0;

  },

  isBundled: async (msg) => {
    const [result] = await pool.query(
    `select bundleID 
    from picking_service_db.order_product_picker 
    where orderProductID = ?`,
    [msg.products[0].orderProductID]
    );

    return result
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
      SELECT 
        op.orderProductID, 
        op.itemcode, 
        op.quantity, 
        op.pickedQuantity,
        p.codebars
      FROM Order_Product op
      JOIN Products p ON p.itemcode = op.itemcode
      WHERE op.orderProductID = ?
      `,
      [orderProductID]
    );
    return rows[0]; 
  }, 

  getAssignment: async (orderProductID, pickerRUT) => {
    const [rows] = await pool.query(`
      SELECT *
      FROM order_product_picker
      WHERE orderProductID = ? AND pickerRUT = ?
    `, [orderProductID, pickerRUT]);
  
    return rows.length > 0 ? rows[0] : null;
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

  findOrderProductsByIds: async (orderProductIDs) => {
    if (!orderProductIDs || orderProductIDs.length === 0) return [];
    
    const placeholders = orderProductIDs.map(() => '?').join(',');
    const sql = `
      SELECT 
        op.orderProductID,
        op.itemcode,
        p.dscription,
        op.pickedQuantity AS found,
        op.notFound AS not_found,
        op.repickedQuantity AS repicked,
        opp.pickerRUT
      FROM Order_Product op
      JOIN Products p ON p.itemcode = op.itemcode
      LEFT JOIN order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE op.orderProductID IN (${placeholders})
    `;
    
    const [rows] = await pool.query(sql, orderProductIDs);
    return rows;
  },
  async assignPickersToProducts(orderID, pickerAssignments) {
    // 1. Seleccionar los productos con pickingStatusID=1 o 2
    const [products] = await pool.query(`
      SELECT orderProductID 
      FROM Order_Product
      WHERE orderID = ?
        AND (pickingStatusID = 1 OR pickingStatusID = 2)
    `, [orderID]);

    if (products.length === 0) {
      // No hay productos para asignar
      return false;
    }

    // 2. Recorremos pickerAssignments
    for (const { orderProductID, pickerRUT } of pickerAssignments) {
      // Revisar la cantidad total de ese producto
      const [prodRows] = await pool.query(`
        SELECT quantity 
        FROM Order_Product 
        WHERE orderProductID = ?
      `, [orderProductID]);
      if (!prodRows || prodRows.length === 0) continue;

      const totalQuantity = prodRows[0].quantity;

      // Verificar si existe en Order_Product_Picker
      const [existing] = await pool.query(`
        SELECT orderProductPickerID 
        FROM Order_Product_Picker
        WHERE orderProductID = ?
      `, [orderProductID]);

      if (existing.length === 0) {
        // Inserta una fila nueva
        await pool.query(`
          INSERT INTO Order_Product_Picker
            (orderProductID, pickerRUT, pickingStatusID, pickedQuantity, assignedQuantity)
          VALUES (?, ?, 1, 0, ?)
        `, [orderProductID, pickerRUT, totalQuantity]);
      } else {
        // Actualiza la fila existente
        await pool.query(`
          UPDATE Order_Product_Picker
          SET pickerRUT = ?, assignedAt = NOW(), assignedQuantity = ?
          WHERE orderProductID = ?
        `, [pickerRUT, totalQuantity, orderProductID]);
      }

      // Cambiar en Order_Product => pickingStatusID=2 (Asignado/EnPicking)
      await pool.query(`
        UPDATE Order_Product
        SET pickingStatusID = 2
        WHERE orderProductID = ?
      `, [orderProductID]);
    }

    // 3. Revisar si TODOS tienen pickers
    const allAssigned = await this.isAllProductsAssigned(orderID);
    return allAssigned ? 3 : 2; // 3 => “EnPickingCompleto”, 2 => “AsignandoPickers”
  },
  upsertOrderPicker: async (orderID, pickerRUT)  => {
    await pool.query(`
      INSERT INTO order_picker (orderID, pickerRUT, pickingStatusID)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE
        pickingStatusID = pickingStatusID
    `, [orderID, pickerRUT]);
  },
  updateAssignedProductsByPicker: async (pickerRUT, orderID, newPickingStatus) => {
    const [result] = await pool.query(`
      UPDATE order_product_picker opp
      JOIN order_product op ON opp.orderProductID = op.orderProductID
      SET opp.pickingStatusID = ?
      WHERE opp.pickerRUT = ?
        AND op.orderID = ?
    `, [newPickingStatus, pickerRUT, orderID]);
  
    return result.affectedRows;
  },
  bulkUpdateProductStatus: async (orderID, pickerRUT, newStatus) => {
    // 1) Primero, ver cuántos productos coinciden
    const [matchingRows] = await pool.query(`
      SELECT DISTINCT op.orderProductID
      FROM order_product op
      JOIN order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE op.orderID = ? 
        AND opp.pickerRUT = ?
    `, [orderID, pickerRUT]);
  
    // Este es el número de productos
    const matchedCount = matchingRows.length;
    if (matchedCount === 0) {
      return 0; // No hay nada que actualizar
    }
  
    // 2) Ahora sí ejecutar el UPDATE
    const [result] = await pool.query(`
      UPDATE order_product op
      JOIN order_product_picker opp ON opp.orderProductID = op.orderProductID
      SET op.pickingStatusID = ?, opp.pickingStatusID = ?
      WHERE op.orderID = ?
        AND opp.pickerRUT = ?
    `, [newStatus, newStatus, orderID, pickerRUT]);
  
    // 3) Retornar matchedCount en lugar de result.affectedRows
    //    De ese modo tu endpoint dirá "Se actualizaron X productos..."
    return matchedCount;
  },
  bulkSetProductsInProcess: async (orderID, orderProductIDs) => {
    if (!orderProductIDs.length) return 0;
  
    const placeholders = orderProductIDs.map(() => '?').join(',');
    const sql = `
      UPDATE order_product_picker opp
      JOIN order_product op ON opp.orderProductID = op.orderProductID
      SET opp.pickingStatusID = 2
      WHERE op.orderID = ?
        AND op.orderProductID IN (${placeholders})
    `;
  
    const params = [orderID, ...orderProductIDs];
    const [result] = await pool.query(sql, params);
  
    return result.affectedRows; // Aquí cuentas las filas actualizadas en order_product_picker
  },

  
  getAllOrderProducts: async() => {
    // Query para obtener todos los productos con su 'orderID'
    const [rows] = await pool.query(`
      SELECT 
      op.orderProductID,
      op.orderID,
      op.itemcode,
      p.dscription,
      p.price,
      op.quantity,
      op.pickedQuantity,
      op.pickingStatusID,
      (op.quantity * p.price) AS total,
      IFNULL(
        (SELECT 1
         FROM order_product_picker opp
         WHERE opp.orderProductID = op.orderProductID
         LIMIT 1),
        0
      ) AS isAssigned
    FROM order_product op
    JOIN products p ON p.itemcode = op.itemcode
    WHERE NOT EXISTS (
      SELECT 1 FROM order_product_picker opp
      WHERE opp.orderProductID = op.orderProductID
    )
    ORDER BY op.orderID
    `);
    return rows;
  },
  async getOrderProductAndOrderID(orderProductID) {
    const [rows] = await pool.query(`
      SELECT orderID, quantity
      FROM order_product
      WHERE orderProductID = ?
    `, [orderProductID]);
    return rows[0]; // { orderID, quantity }
  },
  
};
module.exports = PickingRepository;
