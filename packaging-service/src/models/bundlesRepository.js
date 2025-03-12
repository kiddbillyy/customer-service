const pool = require("../config/db");
const crypto = require("crypto");

/**
 * Hashea una cadena y devuelve el hash MD5 en formato hexadecimal (32 chars).
 */
function md5Hash(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

/**
 * Genera barcode (hash completo) y refid (últimos 7 chars) basados en orderID y un factor único.
 */
function generateCodesForBundle(orderID) {
  const uniqueFactor = `${Date.now()}-${Math.random()}`;
  const baseString = `${orderID}-${uniqueFactor}`;
  const hashed = md5Hash(baseString);

  const barcode = hashed;                  // Hash completo
  const refid = hashed.slice(-7).toUpperCase();  // Últimos 7 chars en mayúscula
  return { barcode, refid };
}

const BundlesRepository = {
  /**
   * Crea un nuevo bulto e inserta los productos asociados.
   * Genera automáticamente un barcode y un refid únicos.
   */
  createBundle: async (orderID, pickerRUT, packageTypeID, products, height, width, length, weight, location, cubage) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Generar barcode y refid
      const { barcode, refid } = generateCodesForBundle(orderID);

      // Insertar el nuevo bulto en la tabla Bundles
      const [bundleResult] = await conn.query(
        `INSERT INTO Bundles (orderID, pickerRUT, packageTypeID, barcode, refid, height, width, length, weight, location, cubage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderID, pickerRUT, packageTypeID, barcode, refid, height, width, length, weight, location, cubage]
      );
      const bundleID = bundleResult.insertId;

      // Insertar los productos en Bundle_Products y actualizar order_product_picker
      for (const { orderProductID, quantity } of products) {
        await conn.query(
          `INSERT INTO Bundle_Products (bundleID, orderProductID, quantity)
           VALUES (?, ?, ?)`,
          [bundleID, orderProductID, quantity]
        );


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
      JOIN Bundle_Products bp ON bp.bundleID = b.bundleID
      WHERE b.bundleID = ?;
      `,
      [bundleID]
    );
    return rows;
  }
};

module.exports = BundlesRepository;
