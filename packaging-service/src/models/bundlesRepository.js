const pool = require("../config/db");

const BundlesRepository = {

  createBundle: async (
    orderID,
    pickerRUT,
    packageTypeID,
    products,
    height,
    width,
    length,
    weight,
    location,
    cubage,
    status
  ) => {
    try {
      // 1) Contamos cuántos bultos hay para generar nuestro shortBarcode
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS count FROM packaging_service_db.Bundles WHERE orderID = ?`,
        [orderID]
      );
      const currentCount = rows[0].count;
      const nextSequence = currentCount + 1;
      const sequenceStr = String(nextSequence).padStart(2, "0");
      const shortBarcode = `PED${orderID}${sequenceStr}`;
      const refid = `${orderID}${sequenceStr}`;
  
      // 2) Insertar en Bundles con OUTPUT para obtener bundleID
      const [bundleResult] = await pool.query(
        `INSERT INTO packaging_service_db.Bundles
         (orderID, pickerRUT, packageTypeID, barcode, refid, height, width, length, weight, location, cubage, status)
         OUTPUT INSERTED.bundleID
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderID,
          pickerRUT,
          packageTypeID,
          shortBarcode,
          refid,
          height || 0,
          width || 0,
          length || 0,
          weight || 0,
          location || null,
          cubage || 0,
          status
        ]
      );
      const bundleID = bundleResult[0].bundleID;
  
      // 3) Insertar productos (si vienen)
      if (products && products.length > 0) {
        for (const { orderProductID, quantity } of products) {
          await pool.query(
            `INSERT INTO packaging_service_db.Bundle_Products (bundleID, orderProductID, quantity)
             VALUES (?, ?, ?)`,
            [bundleID, orderProductID, quantity || 1]
          );
        }
      }
  
      return bundleID;
    } catch (error) {
      console.error("❌ Error creando bulto:", error);
      return null;
    }
  },

  markProductAsLoose: async (orderProductID) => {
    const [result] = await pool.query(
      `UPDATE packaging_service_db.order_product_picker
       SET bundleID = NULL
       WHERE orderProductID = ?`,
      [orderProductID]
    );
    return result.rowsAffected[0] > 0;
  },

  getAllBundles: async () => {
    const [rows] = await pool.query(`
      SELECT
        bundleID AS ID,
        orderID AS refid,
        barcode AS idEntidad,
        auditRUT AS Controlador,
        auditStatusID AS estado
      FROM packaging_service_db.Bundles
    `);
    return rows;
  },

  getBundleById: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT * FROM packaging_service_db.Bundles WHERE bundleID = ?`,
      [bundleID]
    );
    return rows;
  },

  getBundlesByOrder: async (orderID) => {
    const [bundles] = await pool.query(
      `SELECT * FROM packaging_service_db.Bundles WHERE orderID = ?`,
      [orderID]
    );
    return bundles;
  },

  getAlreadyAssignedToPicker: async (orderProductID, pickerRUT, excludeBundleID) => {
    const [rows] = await pool.query(
      `SELECT ISNULL(SUM(bp.quantity), 0) as total
       FROM packaging_service_db.Bundle_Products bp
       JOIN packaging_service_db.Bundles b ON b.bundleID = bp.bundleID
       WHERE bp.orderProductID = ?
         AND b.pickerRUT = ?
         AND b.bundleID != ?`,
      [orderProductID, pickerRUT, excludeBundleID]
    );
    return rows[0].total;
  },

  updateBundleDraft: async (bundleID, fieldsToUpdate) => {
    const {
      packageTypeID,
      height,
      width,
      length,
      weight,
      location
    } = fieldsToUpdate;

    const [result] = await pool.query(
      `UPDATE packaging_service_db.Bundles
       SET
         packageTypeID = COALESCE(?, packageTypeID),
         height        = COALESCE(?, height),
         width         = COALESCE(?, width),
         length        = COALESCE(?, length),
         weight        = COALESCE(?, weight),
         location      = COALESCE(?, location)
       WHERE bundleID = ?`,
      [packageTypeID, height, width, length, weight, location, bundleID]
    );
    return result.rowsAffected[0] > 0;
  },

  addOrUpdateBundleProduct: async (bundleID, orderProductID, quantity) => {
    const [rows] = await pool.query(
      `SELECT * FROM packaging_service_db.Bundle_Products
       WHERE bundleID = ? AND orderProductID = ?`,
      [bundleID, orderProductID]
    );
    if (rows.length > 0) {
      await pool.query(
        `UPDATE packaging_service_db.Bundle_Products
         SET quantity = ?
         WHERE bundleID = ? AND orderProductID = ?`,
        [quantity, bundleID, orderProductID]
      );
    } else {
      await pool.query(
        `INSERT INTO packaging_service_db.Bundle_Products (bundleID, orderProductID, quantity)
         VALUES (?, ?, ?)`,
        [bundleID, orderProductID, quantity]
      );
    }
  },

  countProductsInBundle: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as total
       FROM packaging_service_db.Bundle_Products
       WHERE bundleID = ?`,
      [bundleID]
    );
    return rows[0].total;
  },

  getTotalAssignedToPicker: async (orderProductID, pickerRUT) => {
    const [rows] = await pool.query(`
      SELECT ISNULL(SUM(bp.quantity), 0) as totalAssigned
      FROM packaging_service_db.Bundle_Products bp
      JOIN packaging_service_db.Bundles b ON b.bundleID = bp.bundleID
      WHERE bp.orderProductID = ?
        AND b.pickerRUT = ?
    `, [orderProductID, pickerRUT]);
    return rows[0].totalAssigned;
  },

  getBundlesByPicker: async (orderID, pickerRUT) => {
    const [rows] = await pool.query(
      `SELECT * FROM packaging_service_db.Bundles 
       WHERE orderID = ? AND pickerRUT = ?`,
      [orderID, pickerRUT]
    );
    return rows;
  },

  countOrderProducts: async (orderID) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as total
       FROM packaging_service_db.Order_Product
       WHERE orderID = ?`,
      [orderID]
    );
    return rows[0].total;
  },

  countOrderProductsAssignedToBundles: async (orderID) => {
    const [rows] = await pool.query(
      `SELECT COUNT(DISTINCT bp.orderProductID) as total
       FROM packaging_service_db.Bundle_Products bp
       INNER JOIN packaging_service_db.Bundles b ON bp.bundleID = b.bundleID
       WHERE b.orderID = ?`,
      [orderID]
    );
    return rows[0].total;
  },

  completeAllBundlesOfOrder: async (orderID) => {
    await pool.query(
      `UPDATE packaging_service_db.Bundles
       SET status = 'completed'
       WHERE orderID = ?`,
      [orderID]
    );
  },

  getBundleDetails: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT 
         b.bundleID,
         b.orderID,
         b.packageTypeID,
         b.barcode,
         b.refid,
         b.auditStatusID,
         bp.bundleProductID,
         bp.orderProductID,
         op.itemcode,
         p.dscription,
         bp.quantity AS expected,
         op.pickedQuantity AS found,
         op.notFound AS not_found,
         op.repickedQuantity AS repicked,
         opp.pickerRUT
       FROM packaging_service_db.Bundles b
       JOIN packaging_service_db.Bundle_Products bp ON bp.bundleID = b.bundleID
       JOIN packaging_service_db.Order_Product op ON op.orderProductID = bp.orderProductID
       JOIN packaging_service_db.Products p ON p.itemcode = op.itemcode
       LEFT JOIN packaging_service_db.order_product_picker opp ON opp.orderProductID = op.orderProductID
       WHERE b.bundleID = ?;`,
      [bundleID]
    );

    if (rows.length === 0) return null;

    const bundleDetails = {
      bundleID: rows[0].bundleID,
      orderID: rows[0].orderID,
      packageTypeID: rows[0].packageTypeID,
      barcode: rows[0].barcode,
      refid: rows[0].refid,
      auditStatusID: rows[0].auditStatusID,
      products: []
    };

    rows.forEach((row) => {
      bundleDetails.products.push({
        bundleProductID: row.bundleProductID,
        orderProductID: row.orderProductID,
        itemcode: row.itemcode,
        dscription: row.dscription,
        expected: row.expected,
        found: row.found,
        not_found: row.not_found,
        repicked: row.repicked,
        pickerRUT: row.pickerRUT
      });
    });

    return bundleDetails;
  },

  getOrderProductsWithBundleID: async (orderID) => {
    const [products] = await pool.query(
      `SELECT op.orderProductID, op.itemcode, opp.pickerRUT, opp.bundleID
       FROM packaging_service_db.Order_Product op
       LEFT JOIN packaging_service_db.order_product_picker opp
         ON op.orderProductID = opp.orderProductID
       WHERE op.orderID = ?`,
      [orderID]
    );
    return products;
  },

  updateDimensions: async (bundleID, { height, width, length, weight, cubage, location }) => {
    const [result] = await pool.query(
      `UPDATE packaging_service_db.Bundles
       SET
         height = ?,
         width = ?,
         length = ?,
         weight = ?,
         cubage = ?,
         location = ?
       WHERE bundleID = ?`,
      [height, width, length, weight, cubage, location, bundleID]
    );
    return result.rowsAffected[0] > 0;
  },

  getBundleAndProductsLocal: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT 
         b.bundleID,
         b.orderID,
         b.packageTypeID,
         b.barcode,
         b.refid,
         b.auditStatusID,
         b.height,
         b.width,
         b.length,
         b.weight,
         b.cubage,
         b.location,
         bp.bundleProductID,
         bp.orderProductID,
         bp.quantity AS expected
       FROM packaging_service_db.Bundles b
       LEFT JOIN packaging_service_db.Bundle_Products bp ON bp.bundleID = b.bundleID
       WHERE b.bundleID = ?;`,
      [bundleID]
    );
    return rows;
  },

  markBundleCompleted: async (bundleID, orderID) => {
    const [result] = await pool.query(
      `UPDATE packaging_service_db.Bundles
       SET status = 'completed'
       WHERE bundleID = ? AND orderID = ? AND status = 'draft'`,
      [bundleID, orderID]
    );
    return result.rowsAffected[0] > 0;
  },

  getProductsOfBundle: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT orderProductID, quantity
       FROM packaging_service_db.Bundle_Products
       WHERE bundleID = ?`,
      [bundleID]
    );
    return rows;
  },

  removeBundleProduct: async (bundleID, orderProductID) => {
    const [result] = await pool.query(
      `DELETE FROM packaging_service_db.Bundle_Products
       WHERE bundleID = ? AND orderProductID = ?`,
      [bundleID, orderProductID]
    );
    return result.rowsAffected[0] > 0;
  },
  
  // ---------------------------
  // Funciones relacionadas con bundles y asignaciones:
  
  getTotalAssignedToPicker: async (orderProductID, pickerRUT) => {
    const [rows] = await pool.query(`
      SELECT ISNULL(SUM(bp.quantity), 0) as totalAssigned
      FROM packaging_service_db.Bundle_Products bp
      JOIN packaging_service_db.Bundles b ON b.bundleID = bp.bundleID
      WHERE bp.orderProductID = ? AND b.pickerRUT = ?
    `, [orderProductID, pickerRUT]);
    return rows[0].totalAssigned;
  },

  getBundlesByPicker: async (orderID, pickerRUT) => {
    const [rows] = await pool.query(
      `SELECT * FROM packaging_service_db.Bundles WHERE orderID = ? AND pickerRUT = ?`,
      [orderID, pickerRUT]
    );
    return rows;
  },

  countOrderProducts: async (orderID) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as total FROM packaging_service_db.Order_Product WHERE orderID = ?`,
      [orderID]
    );
    return rows[0].total;
  },

  countOrderProductsAssignedToBundles: async (orderID) => {
    const [rows] = await pool.query(
      `SELECT COUNT(DISTINCT bp.orderProductID) as total
       FROM packaging_service_db.Bundle_Products bp
       INNER JOIN packaging_service_db.Bundles b ON bp.bundleID = b.bundleID
       WHERE b.orderID = ?`,
      [orderID]
    );
    return rows[0].total;
  },

  completeAllBundlesOfOrder: async (orderID) => {
    await pool.query(
      `UPDATE packaging_service_db.Bundles SET status = 'completed' WHERE orderID = ?`,
      [orderID]
    );
  },

  getBundleDetails: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT 
         b.bundleID,
         b.orderID,
         b.packageTypeID,
         b.barcode,
         b.refid,
         b.auditStatusID,
         bp.bundleProductID,
         bp.orderProductID,
         op.itemcode,
         p.dscription,
         bp.quantity AS expected,
         op.pickedQuantity AS found,
         op.notFound AS not_found,
         op.repickedQuantity AS repicked,
         opp.pickerRUT
       FROM packaging_service_db.Bundles b
       JOIN packaging_service_db.Bundle_Products bp ON bp.bundleID = b.bundleID
       JOIN packaging_service_db.Order_Product op ON op.orderProductID = bp.orderProductID
       JOIN packaging_service_db.Products p ON p.itemcode = op.itemcode
       LEFT JOIN packaging_service_db.order_product_picker opp ON opp.orderProductID = op.orderProductID
       WHERE b.bundleID = ?;`,
      [bundleID]
    );
    if (rows.length === 0) return null;
    const bundleDetails = {
      bundleID: rows[0].bundleID,
      orderID: rows[0].orderID,
      packageTypeID: rows[0].packageTypeID,
      barcode: rows[0].barcode,
      refid: rows[0].refid,
      auditStatusID: rows[0].auditStatusID,
      products: []
    };
    rows.forEach((row) => {
      bundleDetails.products.push({
        bundleProductID: row.bundleProductID,
        orderProductID: row.orderProductID,
        itemcode: row.itemcode,
        dscription: row.dscription,
        expected: row.expected,
        found: row.found,
        not_found: row.not_found,
        repicked: row.repicked,
        pickerRUT: row.pickerRUT
      });
    });
    return bundleDetails;
  },

  getOrderProductsWithBundleID: async (orderID) => {
    const [products] = await pool.query(
      `SELECT op.orderProductID, op.itemcode, opp.pickerRUT, opp.bundleID
       FROM packaging_service_db.Order_Product op
       LEFT JOIN packaging_service_db.order_product_picker opp
         ON op.orderProductID = opp.orderProductID
       WHERE op.orderID = ?`,
      [orderID]
    );
    return products;
  },

  updateDimensions: async (bundleID, { height, width, length, weight, cubage, location }) => {
    const [result] = await pool.query(
      `UPDATE packaging_service_db.Bundles
       SET height = ?, width = ?, length = ?, weight = ?, cubage = ?, location = ?
       WHERE bundleID = ?`,
      [height, width, length, weight, cubage, location, bundleID]
    );
    return result.rowsAffected[0] > 0;
  },

  getBundleAndProductsLocal: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT 
         b.bundleID,
         b.orderID,
         b.packageTypeID,
         b.barcode,
         b.refid,
         b.auditStatusID,
         b.height,
         b.width,
         b.length,
         b.weight,
         b.cubage,
         b.location,
         bp.bundleProductID,
         bp.orderProductID,
         bp.quantity AS expected
       FROM packaging_service_db.Bundles b
       LEFT JOIN packaging_service_db.Bundle_Products bp ON bp.bundleID = b.bundleID
       WHERE b.bundleID = ?;`,
      [bundleID]
    );
    return rows;
  },

  markBundleCompleted: async (bundleID, orderID) => {
    const [result] = await pool.query(
      `UPDATE packaging_service_db.Bundles
       SET status = 'completed'
       WHERE bundleID = ? AND orderID = ? AND status = 'draft'`,
      [bundleID, orderID]
    );
    return result.rowsAffected[0] > 0;
  },

  getProductsOfBundle: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT orderProductID, quantity
       FROM packaging_service_db.Bundle_Products
       WHERE bundleID = ?`,
      [bundleID]
    );
    return rows;
  },

  removeBundleProduct: async (bundleID, orderProductID) => {
    const [result] = await pool.query(
      `DELETE FROM packaging_service_db.Bundle_Products
       WHERE bundleID = ? AND orderProductID = ?`,
      [bundleID, orderProductID]
    );
    return result.rowsAffected[0] > 0;
  }
};

module.exports = BundlesRepository;
