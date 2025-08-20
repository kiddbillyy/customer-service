const pool = require("../config/db");

const PickingRepository = {
  // 1. Upsert en order_picker usando MERGE
  async upsertOrderPicker(orderID, pickerRUT) {
    await pool.query(`
      MERGE picking_service_db.order_picker AS target
      USING (VALUES (?, ?)) AS source (orderID, pickerRUT)
      ON target.orderID = source.orderID AND target.pickerRUT = source.pickerRUT
      WHEN NOT MATCHED THEN
        INSERT (orderID, pickerRUT, pickingStatusID)
        VALUES (source.orderID, source.pickerRUT, 1);
    `, [orderID, pickerRUT]);
  },

  assignPickers: async (orderID, pickerAssignments) => {
    const [products] = await pool.query(
      `
      SELECT orderProductID 
      FROM picking_service_db.order_product
      WHERE orderID = ?
        AND (pickingStatusID = 1 OR pickingStatusID = 2)
      `,
      [orderID]
    );

    if (products.length === 0) return false;

    for (let { orderProductID, pickerRUT } of pickerAssignments) {
      // Upsert en 'order_picker'
      await PickingRepository.upsertOrderPicker(orderID, pickerRUT);

      // 1. Obtener la cantidad total del producto
      const [prodRows] = await pool.query(
        `SELECT quantity FROM picking_service_db.order_product WHERE orderProductID = ?`,
        [orderProductID]
      );
      if (!prodRows || prodRows.length === 0) continue;
      const totalQuantity = prodRows[0].quantity;

      // 2. Verificar si el producto ya tiene asignación en 'order_product_Picker'
      const [existing] = await pool.query(
        `
        SELECT orderProductPickerID 
        FROM picking_service_db.order_product_Picker
        WHERE orderProductID = ?
        `,
        [orderProductID]
      );

      // 3. Si no existe, insertar la asignación inicial
      if (existing.length === 0) {
        await pool.query(
          `
          INSERT INTO picking_service_db.order_product_Picker 
            (orderProductID, pickerRUT, pickingStatusID, pickedQuantity, assignedQuantity)
          VALUES (?, ?, 1, 0, ?)
          `,
          [orderProductID, pickerRUT, totalQuantity]
        );
      } else {
        // 4. Si ya existe, actualizar la asignación
        await pool.query(
          `
          UPDATE picking_service_db.order_product_Picker 
          SET pickerRUT = ?,
              assignedAt = GETDATE(),  -- Reemplaza NOW() por GETDATE()
              assignedQuantity = ?
          WHERE orderProductID = ?
          `,
          [pickerRUT, totalQuantity, orderProductID]
        );
      }

      // 5. Actualizar el estado de picking en order_product
      await pool.query(
        `
        UPDATE picking_service_db.order_product
        SET pickingStatusID = 2
        WHERE orderProductID = ?
        `,
        [orderProductID]
      );
    }

    // Verificar si TODOS los productos tienen asignación
    const allAssigned = await PickingRepository.isAllProductsAssigned(orderID);
    return allAssigned ? 3 : 2;
  },
  
  getProductsByOrder: async (orderID) => {
    const [products] = await pool.query(
      `SELECT orderProductID FROM picking_service_db.order_product WHERE orderID = ?`,
      [orderID]
    );
    return products;
  },
  
  // Upsert de producto usando MERGE
  insertOrUpdateProduct: async ({ itemcode, dscription, priceAfterVAT, codebars, whscode, U_Subcategoria }) => {
  await pool.query(`
    MERGE picking_service_db.Products AS target
    USING (VALUES (?, ?, ?, ?, ?, ?)) AS source (
      itemcode,
      dscription,
      priceAfterVat,    -- aquí el nombre interno del parámetro
      codebars,
      whscode,
      U_Subcategoria
    )
    ON target.itemcode = source.itemcode
    WHEN MATCHED THEN 
      UPDATE SET 
         dscription     = source.dscription,
         price           = source.priceAfterVat,  -- asignas priceAfterVat a tu columna price
         codebars        = source.codebars,
         whscode         = source.whscode,
         U_Subcategoria  = source.U_Subcategoria
    WHEN NOT MATCHED THEN
      INSERT (
        itemcode, 
        dscription, 
        price,           -- la columna price
        codebars, 
        whscode, 
        U_Subcategoria
      )
      VALUES (
        source.itemcode, 
        source.dscription, 
        source.priceAfterVat,  -- aquí también
        source.codebars, 
        source.whscode, 
        source.U_Subcategoria
      );
  `, [
    itemcode,
    dscription,
    priceAfterVAT,   // le pasas tu valor de VTEX
    codebars,
    whscode,
    U_Subcategoria
  ]);

  console.log(`✅ Producto ${itemcode} actualizado en la BD`);
},


  // Upsert de order_product usando MERGE
  insertOrUpdateOrderProduct: async (orderID, { itemcode, quantity, lineNum }) => {
    await pool.query(
      `
      MERGE picking_service_db.order_product AS target
      USING (VALUES (?, ?, ?, ?)) 
        AS source (orderID, itemcode, quantity, lineNum)
        ON target.orderID = source.orderID
       AND target.itemcode = source.itemcode
  
      WHEN MATCHED THEN
        UPDATE SET
          -- acumula la cantidad y actualiza lineNum si cambió
          quantity = target.quantity + source.quantity,
          lineNum  = source.lineNum
  
      WHEN NOT MATCHED THEN
        INSERT (
          orderID,
          itemcode,
          quantity,
          pickedQuantity,
          pickingStatusID,
          lineNum
        )
        VALUES (
          source.orderID,
          source.itemcode,
          source.quantity,
          0,            -- pickedQuantity por defecto
          1,            -- pickingStatusID por defecto
          source.lineNum
        );
      `,
      [orderID, itemcode, quantity, lineNum]
    );
  
    console.log(`✅ Producto ${itemcode} (lineNum=${lineNum}) agregado/actualizado en order_product de orden ${orderID}`);
  },
  
  getProductsFromOrder: async (orderID) => {
    const [products] = await pool.query(
      `  SELECT op.orderProductID, 
		  op.orderID, 
		  op.itemcode, 
        p.dscription, 
		p.price, 
		op.quantity, 
		op.pickedQuantity, 
		op.pickingStatusID, 
		op.lineNum,
        (op.quantity * p.price) as total
       FROM picking_service_db.order_product op
       JOIN picking_service_db.products p ON p.itemcode = op.itemcode
       WHERE orderID = ?`,
      [orderID]
    );
    return products.length ? products : null;
  },

  getStatuses: async () => {
    const [rows] = await pool.query(
      `SELECT pickingStatusID, statusName FROM dbo.picking_status`
    );
    return rows;
  },

  getProductsAssignedToPicker: async (pickerRUT) => {
    const [products] = await pool.query(
      `
      SELECT 
        opp.orderProductPickerID AS ID,
        opp.pickerRUT AS Pickeador,
        opp.pickingStatusID,
        opp.pickedQuantity AS CantidadPickeada,
        opp.assignedAt AS Inicio_Picking,
        op.orderProductID,
        op.orderID,
        op.itemcode,
        p.dscription,
        p.price,
        ISNULL(opp.assignedQuantity, op.quantity) AS assignedQuantity,
        (op.quantity * p.price) AS total
      FROM picking_service_db.order_product_picker opp
      JOIN picking_service_db.order_product op ON opp.orderProductID = op.orderProductID
      JOIN picking_service_db.products p ON op.itemcode = p.itemcode
      WHERE opp.pickerRUT = ?
      `,
      [pickerRUT]
    );
    return products.length ? products : null;
  },

  updateOrderProductPicker: async (bundleID, products) => {
    for (const { orderProductID } of products) {
      await pool.query(`
        UPDATE picking_service_db.order_product_picker
        SET bundleID = ?
        WHERE orderProductID = ?
      `, [bundleID, orderProductID]);

      console.log(`✅ order_product_picker actualizado: orderProductID=${orderProductID}, bundleID=${bundleID}`);
    }
  },

  updateProductsToPacked: async (orderProductIDs) => {
    if (!orderProductIDs.length) return 0;
  
    const placeholders = orderProductIDs.map(() => '?').join(', ');
  
    // Actualizar order_product_picker
    let sql = `
      UPDATE opp
      SET opp.pickingStatusID = 4
      FROM picking_service_db.order_product_picker opp
      WHERE opp.orderProductID IN (${placeholders})
    `;
    await pool.query(sql, orderProductIDs);
  
    // Actualizar order_product
    sql = `
      UPDATE op
      SET op.pickingStatusID = 4
      FROM picking_service_db.order_product op
      WHERE op.orderProductID IN (${placeholders})
    `;
    await pool.query(sql, orderProductIDs);
  },

  updateStatus: async (orderProductPickerID, pickingStatusID) => {
    const [result] = await pool.query(
      `
      UPDATE picking_service_db.order_product_picker
      SET pickingStatusID = ?
      WHERE orderProductPickerID = ?
      `,
      [pickingStatusID, orderProductPickerID]
    );
    return result.rowsAffected[0] > 0;
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
      FROM picking_service_db.order_product_picker opp
      JOIN picking_service_db.order_product op ON opp.orderProductID = op.orderProductID
      JOIN picking_service_db.products p ON op.itemcode = p.itemcode
      WHERE opp.pickerRUT = ?
      `,
      [pickerRUT]
    );
    return products.length ? products : null;
  },

  updatePickedProduct: async (orderProductID, quantityToAdd, itemcode, pickerRUT) => {
    // 1) Actualizar order_product usando CASE en lugar de LEAST
    const [resultFirst] = await pool.query(`
      UPDATE picking_service_db.order_product
      SET pickedQuantity = CASE
          WHEN pickedQuantity + ? < quantity THEN pickedQuantity + ?
          ELSE quantity
        END
      WHERE orderProductID = ?
        AND itemcode = ?
    `, [quantityToAdd, quantityToAdd, orderProductID, itemcode]);
  
    if (resultFirst.rowsAffected[0] === 0) return false;
  
    // 2) Actualizar pickingStatusID en order_product
    const [resultSecond] = await pool.query(`
      UPDATE picking_service_db.order_product
      SET pickingStatusID = CASE
          WHEN pickedQuantity >= quantity THEN 3
          ELSE 2
        END
      WHERE orderProductID = ?
        AND itemcode = ?
    `, [orderProductID, itemcode]);
  
    if (resultSecond.rowsAffected[0] === 0) return false;
  
    // 3) Actualizar order_product_Picker: sumar pickedQuantity
    const [pickerUpdate1] = await pool.query(`
      UPDATE opp
      SET opp.pickedQuantity = CASE
          WHEN opp.pickedQuantity + ? < op.quantity THEN opp.pickedQuantity + ?
          ELSE op.quantity
        END
      FROM picking_service_db.order_product_picker opp
      JOIN picking_service_db.order_product op ON opp.orderProductID = op.orderProductID
      WHERE opp.orderProductID = ?
        AND opp.pickerRUT = ?
    `, [quantityToAdd, quantityToAdd, orderProductID, pickerRUT]);
  
    if (pickerUpdate1.rowsAffected[0] === 0) return false;
  
    // 4) Actualizar pickingStatusID en order_product_picker
    const [pickerUpdate2] = await pool.query(`
      UPDATE opp
        SET opp.pickingStatusID = CASE
            WHEN opp.pickedQuantity >= opp.assignedQuantity THEN 3   -- Usar assignedQuantity
            ELSE 2
        END
        FROM picking_service_db.order_product_picker opp
        JOIN picking_service_db.order_product op ON opp.orderProductID = op.orderProductID
        WHERE opp.orderProductID = ?
          AND opp.pickerRUT = ?
    `, [orderProductID, pickerRUT]);
  
    return pickerUpdate2.rowsAffected[0] > 0;
  },
  
  isPickingComplete: async (orderID) => {
    const [result] = await pool.query(
      `
      SELECT COUNT(*) as pending
      FROM picking_service_db.order_product
      WHERE orderID = ?
        AND pickingStatusID != 3
      `,
      [orderID]
    );
    return result[0].pending === 0;
  },

  hasMissingProducts: async (orderID) => {
    const [result] = await pool.query(
      `
      SELECT COUNT(*) as missing
      FROM picking_service_db.order_product
      WHERE orderID = ?
        AND pickedQuantity < quantity
      `,
      [orderID]
    );
    return result[0].missing > 0;
  },

  handleNewBundle: async (msg) => {
    const [result] = await pool.query(
      `
      UPDATE picking_service_db.order_product_picker
      SET bundleID = ?
      WHERE orderProductID = ? AND pickerRUT = ?
      `,
      [msg.bundleID, msg.products[0].orderProductID, msg.pickerRUT]
    );
    return result.rowsAffected[0] > 0;
  },

  isBundled: async (msg) => {
    const [result] = await pool.query(
      `
      SELECT bundleID 
      FROM picking_service_db.order_product_picker 
      WHERE orderProductID = ?
      `,
      [msg.products[0].orderProductID]
    );
    return result;
  },

  isAllProductsAssigned: async (orderID) => {
    const [result] = await pool.query(
      `
      SELECT COUNT(*) as unassigned
      FROM picking_service_db.order_product
      WHERE orderID = ?
        AND orderProductID NOT IN (
          SELECT orderProductID FROM picking_service_db.order_product_Picker
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
      FROM picking_service_db.order_product
      WHERE orderID = ?
        AND pickingStatusID != 3
        AND pickingStatusID != 4
      `,
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
      FROM picking_service_db.order_product op
      JOIN picking_service_db.Products p ON p.itemcode = op.itemcode
      WHERE op.orderProductID = ?
      `,
      [orderProductID]
    );
    return rows[0]; 
  },
  updateAssignmentMissingQuantity: async (orderProductID, pickerRUT, newMissingQuantity, newAssignedQuantity) => {
    const [result] = await pool.query(`
      UPDATE picking_service_db.order_product_picker
      SET missingQuantity = ?,
          assignedQuantity = ?
      WHERE orderProductID = ?
        AND pickerRUT = ?
    `, [newMissingQuantity, newAssignedQuantity, orderProductID, pickerRUT]);
  
    // rowsAffected[0] > 0 indica que sí se actualizó
    return result.rowsAffected[0] > 0;
  },
  updatePickerStatusAfterMissing: async (orderProductID, pickerRUT) => {
    // Usamos la misma lógica que en updatePickedProduct, 
    // pero comparamos pickedQuantity vs assignedQuantity
    const [result] = await pool.query(`
      UPDATE opp
      SET opp.pickingStatusID = CASE
        WHEN opp.pickedQuantity >= opp.assignedQuantity THEN 3
        ELSE 2
      END
      FROM picking_service_db.order_product_picker opp
      WHERE opp.orderProductID = ?
        AND opp.pickerRUT = ?
    `, [orderProductID, pickerRUT]);
  
    return result.rowsAffected[0] > 0;
  },
  updateProductStatusAfterMissing: async (orderProductID) => {
    // 1. Obtener la suma de pickedQuantity de todos los pickers
    const [rows] = await pool.query(`
      SELECT SUM(pickedQuantity) as totalPicked
      FROM picking_service_db.order_product_picker
      WHERE orderProductID = ?
    `, [orderProductID]);
  
    const totalPicked = rows[0]?.totalPicked || 0;
  
    // 2. Actualizar pickedQuantity y pickingStatusID en order_product usando "?" en lugar de "@"
    await pool.query(`
      UPDATE picking_service_db.order_product
      SET pickedQuantity = ?,
          pickingStatusID = CASE
            WHEN ? >= quantity THEN 3
            ELSE 2
          END
      WHERE orderProductID = ?
    `, [totalPicked, totalPicked, orderProductID]);
  },

  getAssignment: async (orderProductID, pickerRUT) => {
    const [rows] = await pool.query(`
      SELECT *
      FROM picking_service_db.order_product_picker
      WHERE orderProductID = ? AND pickerRUT = ?
      `,
      [orderProductID, pickerRUT]
    );
  
    return rows.length > 0 ? rows[0] : null;
  },

  // Obtener la asignación actual en order_product_picker
  getOrderProductPicker: async (orderProductID) => {
    const [rows] = await pool.query(
      `
      SELECT *
      FROM picking_service_db.order_product_picker
      WHERE orderProductID = ?
      `,
      [orderProductID]
    );
    return rows[0];
  },

  // Registrar la reasignación
  recordPickerReassignment: async ({ orderProductID, oldPicker, newPicker, reason }) => {
    const [result] = await pool.query(
      `
      INSERT INTO picking_service_db.picker_reassignments (orderProductID, oldPicker, newPicker, reason)
      OUTPUT INSERTED.reassignmentID
      VALUES (?, ?, ?, ?)
      `,
      [orderProductID, oldPicker, newPicker, reason]
    );
    return result[0].reassignmentID;
  },

  createAdditionalAssignment: async (orderProductID, newPicker, assignedQuantity) => {
    const [result] = await pool.query(
      `
      INSERT INTO picking_service_db.order_product_picker 
        (orderProductID, pickerRUT, pickingStatusID, pickedQuantity, assignedQuantity)
      OUTPUT INSERTED.orderProductPickerID
      VALUES (?, ?, 2, 0, ?)
      `,
      [orderProductID, newPicker, assignedQuantity]
    );
    return result[0].orderProductPickerID;
  },

  // Actualizar la asignación para reasignar el producto
  reassignProductPicker: async (orderProductID, newPicker, assignedQuantity) => {
    const [result] = await pool.query(
      `
      UPDATE picking_service_db.order_product_picker
      SET pickerRUT = ?,
          pickingStatusID = 2
      WHERE orderProductID = ?
      `,
      [newPicker, orderProductID]
    );
    return result.rowsAffected[0] > 0;
  },
  updateOrderProductNotFound: async (orderProductID, missingQuantity) => {
    const [result] = await pool.query(`
      UPDATE picking_service_db.Order_Product
      SET notFound = notFound + ?
      WHERE orderProductID = ?
    `, [missingQuantity, orderProductID]);
    return result.rowsAffected[0] > 0;
  },
  updateAssignmentQuantityForMissing: async (orderProductID, pickerRUT, newAssignedQuantity) => {
    const [result] = await pool.query(
      `UPDATE picking_service_db.order_product_picker
       SET assignedQuantity = ?
       WHERE orderProductID = ? AND pickerRUT = ?`,
      [newAssignedQuantity, orderProductID, pickerRUT]
    );
    return result.rowsAffected[0] > 0;
  },

  updateAssignmentAssignedQuantity: async (orderProductID, pickerRUT, newAssignedQuantity) => {
    const [result] = await pool.query(
      `
      UPDATE picking_service_db.order_product_picker
      SET assignedQuantity = ?
      WHERE orderProductID = ? AND pickerRUT = ?
      `,
      [newAssignedQuantity, orderProductID, pickerRUT]
    );
    return result.rowsAffected[0] > 0;
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
      FROM picking_service_db.order_product op
      JOIN picking_service_db.Products p ON p.itemcode = op.itemcode
      LEFT JOIN picking_service_db.order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE op.orderProductID IN (${placeholders})
    `;
    
    const [rows] = await pool.query(sql, orderProductIDs);
    return rows;
  },
  assignPickersToProductsLeftover: async (orderID, assignments) => {
    for (const { orderProductID, pickerRUT } of assignments) {
      // 1) Calcular cuántas unidades quedan por asignar (leftover)
      const leftover = await PickingRepository.getLeftover(orderProductID);
      if (leftover <= 0) {
        // Si no hay sobrante, no hacemos nada
        continue;
      }
  
      // 2) Siempre insertamos un nuevo registro en order_product_picker
      //    Asumimos pickingStatusID=1 si está "Asignado pero no iniciado"
      //    (ajústalo a 2 si prefieres "En Proceso" inmediatamente)
      await pool.query(`
        INSERT INTO picking_service_db.order_product_picker
          (orderProductID, pickerRUT, pickingStatusID, pickedQuantity, assignedQuantity, missingQuantity, assignedAt)
        VALUES (?, ?, 1, 0, ?, 0, GETDATE())
      `, [
        orderProductID,
        pickerRUT,
        leftover // El leftover calculado
      ]);
  
      // 3) Actualizar el estado de order_product a 2 ("En Proceso/Asignado")
      await pool.query(`
        UPDATE picking_service_db.order_product
        SET pickingStatusID = 2
        WHERE orderProductID = ?
      `, [orderProductID]);
    }
  
    // 4) Verificamos si la orden ya quedó completamente asignada
    const allAssigned = await PickingRepository.isAllProductsAssigned(orderID);
    return allAssigned ? 3 : 2;
  },
  getLeftover: async (orderProductID) => {
    const [rows] = await pool.query(`
      SELECT 
        (op.quantity - ISNULL(SUM(opp.assignedQuantity), 0)) AS leftover
      FROM picking_service_db.order_product op
      LEFT JOIN picking_service_db.order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE op.orderProductID = ?
      GROUP BY op.quantity
    `, [orderProductID]);
  
    if (rows.length === 0) return 0;
    return rows[0].leftover || 0;
  },

  assignPickersToProducts: async (orderID, pickerAssignments) => {
    // 1. Seleccionar los productos con pickingStatusID=1 o 2
    const [products] = await pool.query(`
      SELECT orderProductID 
      FROM picking_service_db.order_product
      WHERE orderID = ?
        AND (pickingStatusID = 1 OR pickingStatusID = 2)
    `, [orderID]);

    if (products.length === 0) return false;

    // 2. Recorremos pickerAssignments
    for (const { orderProductID, pickerRUT } of pickerAssignments) {
      // Revisar la cantidad total de ese producto
      const [prodRows] = await pool.query(`
        SELECT quantity 
        FROM picking_service_db.order_product 
        WHERE orderProductID = ?
      `, [orderProductID]);
      if (!prodRows || prodRows.length === 0) continue;

      const totalQuantity = prodRows[0].quantity;

      // Verificar si existe en order_product_Picker
      const [existing] = await pool.query(`
        SELECT orderProductPickerID 
        FROM picking_service_db.order_product_Picker
        WHERE orderProductID = ?
      `, [orderProductID]);

      if (existing.length === 0) {
        // Insertar nueva asignación
        await pool.query(`
          INSERT INTO picking_service_db.order_product_Picker
            (orderProductID, pickerRUT, pickingStatusID, pickedQuantity, assignedQuantity)
          VALUES (?, ?, 1, 0, ?)
        `, [orderProductID, pickerRUT, totalQuantity]);
      } else {
        // Actualizar asignación existente: usar GETDATE() en lugar de NOW()
        await pool.query(`
          UPDATE picking_service_db.order_product_Picker
          SET pickerRUT = ?,
              assignedAt = GETDATE(),
              assignedQuantity = ?
          WHERE orderProductID = ?
        `, [pickerRUT, totalQuantity, orderProductID]);
      }

      // Actualizar el estado en order_product a 2 (Asignado/EnPicking)
      await pool.query(`
        UPDATE picking_service_db.order_product
        SET pickingStatusID = 2
        WHERE orderProductID = ?
      `, [orderProductID]);
    }

    // 3. Verificar si TODOS los productos tienen asignado un picker
    const allAssigned = await PickingRepository.isAllProductsAssigned(orderID);
    return allAssigned ? 3 : 2;
  },

  updateAssignedProductsByPicker: async (pickerRUT, orderID, newPickingStatus) => {
    const [result] = await pool.query(`
      UPDATE op
      SET op.pickingStatusID = ?,
          opp.pickingStatusID = ?
      FROM picking_service_db.order_product op
      JOIN picking_service_db.order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE opp.pickerRUT = ? AND op.orderID = ?
    `, [newPickingStatus, newPickingStatus, pickerRUT, orderID]);
  
    return result.rowsAffected[0];
  },

  getAssignedQuantity: async (orderProductID, pickerRUT) => {
    const [rows] = await pool.query(`
      SELECT TOP 1 assignedQuantity
      FROM picking_service_db.order_product_picker
      WHERE orderProductID = ? AND pickerRUT = ?
    `, [orderProductID, pickerRUT]);
    
    if (rows.length === 0) return null;
    return rows[0].assignedQuantity;
  },

  bulkUpdateProductStatus: async (orderID, pickerRUT, newStatus) => {
    // 1) Contar productos que cumplen la condición
    const [matchingRows] = await pool.query(`
      SELECT DISTINCT op.orderProductID
      FROM picking_service_db.order_product op
      JOIN picking_service_db.order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE op.orderID = ? AND opp.pickerRUT = ?
    `, [orderID, pickerRUT]);
  
    const matchedCount = matchingRows.length;
    if (matchedCount === 0) return 0;
  
    // 2) Ejecutar el UPDATE usando FROM con JOIN
    await pool.query(`
      UPDATE op
      SET op.pickingStatusID = ?, opp.pickingStatusID = ?
      FROM picking_service_db.order_product op
      JOIN picking_service_db.order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE op.orderID = ? AND opp.pickerRUT = ?
    `, [newStatus, newStatus, orderID, pickerRUT]);
  
    return matchedCount;
  },
  getAssignmentsByOrderProduct: async (orderProductID) =>  {
    const [rows] = await pool.query(`
      SELECT orderProductPickerID,
             orderProductID,
             pickerRUT,
             pickingStatusID,
             pickedQuantity,
             assignedQuantity,
             missingQuantity
      FROM picking_service_db.order_product_picker
      WHERE orderProductID = ?
    `, [orderProductID]);
    return rows;
  },

  bulkSetProductsInProcess: async (orderID, orderProductIDs) => {
    if (!orderProductIDs.length) return 0;
  
    const placeholders = orderProductIDs.map(() => '?').join(', ');
  
    const sql = `
      UPDATE opp
      SET opp.pickingStatusID = 2
      FROM picking_service_db.order_product_picker opp
      JOIN picking_service_db.order_product op ON opp.orderProductID = op.orderProductID
      WHERE op.orderID = ? AND op.orderProductID IN (${placeholders})
    `;
  
    const params = [orderID, ...orderProductIDs];
    const [result] = await pool.query(sql, params);
  
    return result.rowsAffected[0];
  },

  getAllOrderProducts: async () => {
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
      op.lineNum,
      (op.quantity * p.price) AS total,

      /* Cálculo de leftover: diferencia entre
         la cantidad total y la suma de assignedQuantity */
      op.quantity
      - ISNULL(
          (
            SELECT SUM(opp.assignedQuantity)
            FROM picking_service_db.order_product_picker opp
            WHERE opp.orderProductID = op.orderProductID
          ), 0
        )
      AS leftover

    FROM picking_service_db.order_product op
    JOIN picking_service_db.products p ON p.itemcode = op.itemcode
    WHERE (
      op.quantity
      - ISNULL(
          (SELECT SUM(opp.assignedQuantity)
          FROM picking_service_db.order_product_picker opp
          WHERE opp.orderProductID = op.orderProductID
          ), 0
        )
    ) > 0
    ORDER BY op.orderID
    `);
    return rows;
  },

  getOrderProductAndOrderID: async (orderProductID) => {
    const [rows] = await pool.query(`
      SELECT orderID, quantity
      FROM picking_service_db.order_product
      WHERE orderProductID = ?
    `, [orderProductID]);
    return rows[0];
  },
  async getAvailableToAssign(orderProductID) {
    const [rows] = await pool.query(`
      SELECT quantity, pickedQuantity, notFound
      FROM picking_service_db.order_product
      WHERE orderProductID = ?
    `, [orderProductID]);
  
    if (rows.length === 0) return 0;
    const { quantity, pickedQuantity, notFound } = rows[0];
    return Math.max(quantity - pickedQuantity - notFound, 0);
  },
  countNonPackedProducts: async (orderID) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as nonPackedCount 
       FROM picking_service_db.order_product 
       WHERE orderID = ? AND pickingStatusID <> 4`,
      [orderID]
    );
    return rows[0].nonPackedCount;
  },
  updatePickerUbicacion: async (orderProductID, pickerRUT, ubicacion) => {
    const [result] = await pool.query(`
      UPDATE picking_service_db.order_product_picker
      SET ubicacion = ?
      WHERE orderProductID = ?
        AND pickerRUT = ?
    `, [ubicacion, orderProductID, pickerRUT]);
  
    return result.rowsAffected[0] > 0;
  },
  
  
};

module.exports = PickingRepository;
