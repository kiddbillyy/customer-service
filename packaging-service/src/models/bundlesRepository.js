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
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1) Contamos cuántos bultos hay para hacer nuestro shortBarcode
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS count FROM Bundles WHERE orderID = ?`,
        [orderID]
      );
      const currentCount = rows[0].count;
      const nextSequence = currentCount + 1;

      const sequenceStr = String(nextSequence).padStart(2, "0");
      const shortBarcode = `PED${orderID}${sequenceStr}`;
      const refid = `${orderID}${sequenceStr}`;

      // 2) Insertar en Bundles (incluyendo status)
      const [bundleResult] = await conn.query(
        `INSERT INTO Bundles
         (orderID, pickerRUT, packageTypeID, barcode, refid, height, width, length, weight, location, cubage, status)
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
      const bundleID = bundleResult.insertId;

      // 3) Insertar productos (si vienen)
      if (products && products.length > 0) {
        for (const { orderProductID, quantity } of products) {
          await conn.query(
            `INSERT INTO Bundle_Products (bundleID, orderProductID, quantity)
             VALUES (?, ?, ?)`,
            [bundleID, orderProductID, quantity || 1]
          );
        }
      }

      await conn.commit();
      return bundleID;
    } catch (error) {
      await conn.rollback();
      console.error("❌ Error creando bulto:", error);
      return null;
    } finally {
      conn.release();
    }
  },

  markProductAsLoose: async (orderProductID) => {
    const [result] = await pool.query(
      `UPDATE order_product_picker
       SET bundleID = NULL
       WHERE orderProductID = ?`,
      [orderProductID]
    );
    return result.affectedRows > 0;
  },

  getAllBundles: async () => {
    const [rows] = await pool.query(`
      SELECT
        bundleID AS ID,
        orderID AS refid,
        barcode AS idEntidad,
        auditRUT AS Controlador,
        auditStatusID AS estado
      FROM Bundles
    `);
    return rows;
  },
  getBundleById: async (bundleID) => {
    const [rows] = await pool.query(
      `SELECT * FROM Bundles WHERE bundleID = ?`,
      [bundleID]
    );
    return rows;
  },

  getBundlesByOrder: async (orderID) => {
    const [bundles] = await pool.query(
      `SELECT * FROM Bundles WHERE orderID = ?`,
      [orderID]
    );
    return bundles;
  },

  updateBundleDraft: async (bundleID, fieldsToUpdate) => {
    // Construir el query dinámicamente o algo simple:
    const {
      packageTypeID,
      height,
      width,
      length,
      weight,
      location
    } = fieldsToUpdate;

    // Query de ejemplo
    const [result] = await pool.query(
      `UPDATE Bundles
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
    return result.affectedRows > 0;
  },
  addOrUpdateBundleProduct: async (bundleID, orderProductID, quantity) => {
    // Ver si ya existe:
    const [rows] = await pool.query(
      `SELECT * FROM Bundle_Products
       WHERE bundleID = ? AND orderProductID = ?`,
      [bundleID, orderProductID]
    );
    if (rows.length > 0) {
      // Ya existe, actualizamos la quantity
      await pool.query(
        `UPDATE Bundle_Products
         SET quantity = ?
         WHERE bundleID = ? AND orderProductID = ?`,
        [quantity, bundleID, orderProductID]
      );
    } else {
      // Insertamos
      await pool.query(
        `INSERT INTO Bundle_Products (bundleID, orderProductID, quantity)
         VALUES (?, ?, ?)`,
        [bundleID, orderProductID, quantity]
      );
    }
  },
  getBundlesByOrder: async (orderID) => {
    const [bundles] = await pool.query(
      `SELECT * FROM Bundles WHERE orderID = ?`,
      [orderID]
    );
    return bundles;
  },
  countProductsInBundle: async (bundleID) => {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total
       FROM Bundle_Products
       WHERE bundleID = ?`,
      [bundleID]
    );
    return total;
  },
  getBundlesByPicker: async (orderID, pickerRUT) => {
    const [rows] = await pool.query(
      `SELECT * FROM Bundles 
       WHERE orderID = ? 
         AND pickerRUT = ?`,
      [orderID, pickerRUT]
    );
    return rows;
  },
  countOrderProducts: async (orderID) => {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total
       FROM Order_Product
       WHERE orderID = ?`,
      [orderID]
    );
    return total;
  },
  countOrderProductsAssignedToBundles: async (orderID) => {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(DISTINCT bp.orderProductID) as total
       FROM Bundle_Products bp
       INNER JOIN Bundles b ON bp.bundleID = b.bundleID
       WHERE b.orderID = ?`,
      [orderID]
    );
    return total;
  },
  completeAllBundlesOfOrder: async (orderID) => {
    await pool.query(
      `UPDATE Bundles
       SET status = 'completed'
       WHERE orderID = ?`,
      [orderID]
    );
  },

  getBundleDetails: async (bundleID) => {
    const [rows] = await pool.query(
      `
      SELECT 
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
      FROM Bundles b
      JOIN Bundle_Products bp ON bp.bundleID = b.bundleID
      JOIN Order_Product op ON op.orderProductID = bp.orderProductID
      JOIN Products p ON p.itemcode = op.itemcode
      LEFT JOIN order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE b.bundleID = ?;
      `,
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
       FROM Order_Product op
       LEFT JOIN order_product_picker opp
         ON op.orderProductID = opp.orderProductID
       WHERE op.orderID = ?`,
      [orderID]
    );
    return products;
  },

  updateDimensions: async (bundleID, { height, width, length, weight, cubage, location }) => {
    const [result] = await pool.query(
      `
      UPDATE Bundles
      SET
        height = ?,
        width = ?,
        length = ?,
        weight = ?,
        cubage = ?,
        location = ?
      WHERE bundleID = ?
      `,
      [height, width, length, weight, cubage, location, bundleID]
    );
    return result.affectedRows > 0;
  },
  getBundleAndProductsLocal: async (bundleID) => {
    // OJO: solo consultamos tablas locales: Bundles y Bundle_Products
    const [rows] = await pool.query(
      `
      SELECT 
        b.bundleID,
        b.orderID,
        b.packageTypeID,
        b.barcode,
        b.refid,
        b.auditStatusID,
        b.cubage,
        b.location,
        bp.bundleProductID,
        bp.orderProductID,
        bp.quantity AS expected
      FROM Bundles b
      LEFT JOIN Bundle_Products bp ON bp.bundleID = b.bundleID
      WHERE b.bundleID = ?;
      `,
      [bundleID]
    );
    return rows;
  }
};

module.exports = BundlesRepository;
