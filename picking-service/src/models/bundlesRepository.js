const pool = require('../config/db');
const crypto = require('crypto');

/**
 * Hashea una cadena y devuelve el hash MD5 en formato hexadecimal (32 chars).
 */
function md5Hash(str) {
  return crypto.createHash('md5')
               .update(str)
               .digest('hex');
}

/**
 * Genera barcode (hash completo) y refid (últimos 7 chars) basados en:
 *   - orderID
 *   - un factor único (por ejemplo, Date.now() + random)
 */
function generateCodesForBundle(orderID) {
  // Factor único: marca de tiempo + aleatorio
  const uniqueFactor = `${Date.now()}-${Math.random()}`;
  
  // Construimos una cadena base
  const baseString = `${orderID}-${uniqueFactor}`;
  
  // Generamos el hash MD5
  const hashed = md5Hash(baseString);
  
  // barcode = todo el hash (32 caracteres hex)
  const barcode = hashed;
  // refid = últimos 7 caracteres en mayúscula
  const refid = hashed.slice(-7).toUpperCase();
  
  return { barcode, refid };
}

const BundlesRepository = {
  /**
   * Crea un nuevo bulto e inserta los productos asociados.
   * Genera automáticamente un barcode y un refid únicos.
   */
  createBundle: async (orderID, pickerRUT, packageType, products) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Generar barcode y refid con factor único
      const { barcode, refid } = generateCodesForBundle(orderID);

      // 1. Insertar bulto en la tabla Bundles
      const [bundleResult] = await conn.query(
        `INSERT INTO Bundles (orderID, pickerRUT, packageType, barcode, refid)
         VALUES (?, ?, ?, ?, ?)`,
        [orderID, pickerRUT, packageType, barcode, refid]
      );
      const bundleID = bundleResult.insertId;

      // 2. Insertar los productos en "Bundle_Products" y actualizar "order_product_picker"
      for (const { orderProductID, quantity } of products) {
        // Insertar en Bundle_Products
        await conn.query(
          `INSERT INTO Bundle_Products (bundleID, orderProductID, quantity) VALUES (?, ?, ?)`,
          [bundleID, orderProductID, quantity]
        );

        // Asociar el producto al bulto en order_product_picker
        await conn.query(
          `UPDATE order_product_picker
           SET bundleID = ?
           WHERE orderProductID = ?`,
          [bundleID, orderProductID]
        );
      }

      await conn.commit();
      return bundleID;
    } catch (error) {
      await conn.rollback();
      console.error('❌ Error creando bulto:', error);
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
    select bundleID as ID,  orderid as refid, barcode as idEntidad, auditRUT as Controlador, auditStatusID as estado
from bundles
    `);
    return rows;
  },

  getBundlesByOrder: async (orderID) => {
    const [bundles] = await pool.query(
      `SELECT * FROM Bundles
       WHERE orderID = ?`,
      [orderID]
    );
    return bundles; // Retorna la lista de bultos de esa orden
  },

  getBundleDetails: async (bundleID) => {
    const [rows] = await pool.query(
      `
      SELECT 
        b.bundleID,
        b.orderID,
        b.packageType,
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
      FROM bundles b
      JOIN bundle_products bp ON bp.bundleID = b.bundleID 
      JOIN order_product op ON op.orderProductID = bp.orderProductID
      JOIN products p ON p.itemcode = op.itemcode
      LEFT JOIN order_product_picker opp ON opp.orderProductID = op.orderProductID
      WHERE b.bundleID = ?;
      `,
      [bundleID]
    );
  
    if (rows.length === 0) return null;
  
    // Datos comunes del bulto (se asume que son los mismos en todas las filas)
    const bundleDetails = {
      bundleID: rows[0].bundleID,
      orderID: rows[0].orderID,
      packageType: rows[0].packageType,
      barcode: rows[0].barcode,
      refid: rows[0].refid,
      auditStatusID: rows[0].auditStatusID,
      products: []
    };
  
    // Recorrer cada fila para formar el listado de productos
    rows.forEach(row => {
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
       FROM order_product op
       LEFT JOIN order_product_picker opp
         ON op.orderProductID = opp.orderProductID
       WHERE op.orderID = ?`,
      [orderID]
    );
    return products;
  }
};

module.exports = BundlesRepository;
