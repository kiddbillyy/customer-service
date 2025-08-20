// src/models/inventoryRepository.js
const { poolPromise, query } = require('../config/db'); // 👈  nuevo import
const sql = require('mssql');

const PAGE_SIZE = 11;

const buildWhere = (filters, request) => {
  const clauses = [];

  if (filters.sku) {
    clauses.push('inv.sku LIKE @sku');
    request.input('sku', sql.VarChar, `%${filters.sku}%`);
  }
  if (filters.id_almacen) {
    clauses.push('inv.id_almacen = @id_almacen');
    request.input('id_almacen', sql.Int, filters.id_almacen);
  }
  if (filters.nombre) {
    clauses.push('prod.itemname LIKE @nombre');
    request.input('nombre', sql.NVarChar, `%${filters.nombre}%`);
  }
  if (filters.status) {
    clauses.push('prod.activo = @status');
    request.input('status', sql.Char, filters.status);
  }

  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
};

const InventoryRepository = {
  // -----------------------------------------------------------
  // 1. Usamos query() – no hace falta tocar el pool directo
  // -----------------------------------------------------------
  async getAll () {
    const [rows] = await query(
      'SELECT TOP 10 * FROM inventory_service_db.dbo.inventario;'
    );
    return rows;
  },


  // 👇 Agrega esto dentro del objeto InventoryRepository
async getProductBySku (sku) {
  const pool    = await poolPromise;
  const request = pool.request();
  request.input('sku', sql.VarChar, sku);

  const result = await request.query(`
    SELECT 
      prod.itemcode     AS sku,
      prod.itemname     AS nombre,
      prod.u_imagen,
      prod.u_name,
      prod.createdate,
      prod.updatedate,
      prod.activo
    FROM productos prod
    WHERE prod.itemcode = @sku
  `);

  return result.recordset[0] || null;
},

async getInventoriesBySku (sku) {
  const pool    = await poolPromise;
  const request = pool.request();
  request.input('sku', sql.VarChar, sku);

  const result = await request.query(`
    SELECT
      inv.sku,
      inv.id_almacen,
      alm.nombre,
      alm.ubicacion,
      alm.status,
      inv.disponible,
      inv.stock_fisico,
      inv.en_nota_venta,
      inv.en_orden_compra
    FROM inventario inv
    JOIN almacenes alm ON alm.id_almacen = inv.id_almacen
    WHERE inv.sku = @sku
    ORDER BY 
      alm.id_almacen ASC
  `);

  return result.recordset;
},


  // -----------------------------------------------------------
  // 2. Para request/query necesitamos el pool ya conectado
  // -----------------------------------------------------------
  async getInventoriesWithPriorityOnly (sku) {
    const pool    = await poolPromise;      // 👈  espera conexión
    const request = pool.request();
    request.input('sku', sql.VarChar, sku);

    const result = await request.query(`
      SELECT inv.sku, inv.id_almacen, alm.nombre, alm.prioridad, inv.disponible
        FROM inventario inv
        JOIN almacenes alm ON alm.id_almacen = inv.id_almacen
       WHERE inv.sku = @sku
         AND alm.status = 'Activo'
         AND alm.prioridad IS NOT NULL
    `);

    return { data: result.recordset };
  },

  // -----------------------------------------------------------
  // 3. Misma idea para filtros + paginación
  // -----------------------------------------------------------
  async getAllProducts (filters = {}, page = 1) {
    const pageNum = Math.max(1, Number(page) || 1);
    const offset  = (pageNum - 1) * PAGE_SIZE;

    const pool    = await poolPromise;
    const request = pool.request();
    request.input('offset', sql.Int, offset);

    const whereSql = buildWhere(filters, request);

    const queryData = `
      SELECT
        prod.u_imagen, inv.sku, prod.itemname,
        inv.id_almacen, alm.nombre, alm.ubicacion,
        prod.units, inv.disponible,
        prod.createdate, prod.u_name, prod.updatedate,
        prod.activo, inv.stock_fisico,
        inv.en_nota_venta, inv.en_orden_compra
      FROM inventario inv
      JOIN productos prod ON prod.itemcode = inv.sku
      JOIN almacenes alm  ON alm.id_almacen = inv.id_almacen
      ${whereSql}
      ORDER BY prod.u_imagen DESC, id_almacen ASC
      OFFSET @offset ROWS FETCH NEXT ${PAGE_SIZE} ROWS ONLY;
    `;

    const queryCount = `
      SELECT COUNT(*) AS total
      FROM inventario inv
      JOIN productos prod ON prod.itemcode = inv.sku
      JOIN almacenes alm  ON alm.id_almacen = inv.id_almacen
      ${whereSql};
    `;

    const [dataResult, countResult] = await Promise.all([
      request.query(queryData),
      request.query(queryCount)
    ]);

    const totalItems = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);

    return { data: dataResult.recordset, totalItems, totalPages, page: pageNum };
  },

  // -----------------------------------------------------------
  // 4. Movimientos: volvemos a usar query() estilo mysql2
  // -----------------------------------------------------------
  async applyMovement ({ sku, almacenId, delta, movType }) {
    let sqlText, params;

    switch (movType) {
      case 'entrada':
        sqlText = `
          UPDATE inventory_service_db.dbo.inventario
             SET stock_fisico  = stock_fisico + ?,
                 fecha_actualizacion = GETDATE()
           WHERE sku = ? AND id_almacen = ?
        `;
        params = [delta, sku, almacenId];
        break;

      case 'salida':
        sqlText = `
          UPDATE inventory_service_db.dbo.inventario
             SET stock_fisico = stock_fisico - ?, fecha_actualizacion = GETDATE()
           WHERE sku = ? AND id_almacen = ?
        `;
        params = [delta, sku, almacenId];
        break;

      case 'reserva':
        sqlText = `
          UPDATE inventory_service_db.dbo.inventario
             SET en_nota_venta = en_nota_venta + ?, fecha_actualizacion = GETDATE()
           WHERE sku = ? AND id_almacen = ?
        `;
        params = [delta, sku, almacenId];
        break;

      case 'entrega':
        sqlText = `
          UPDATE inventory_service_db.dbo.inventario
             SET stock_fisico  = stock_fisico - ?,
                 en_nota_venta = CASE WHEN en_nota_venta >= ? THEN en_nota_venta - ? ELSE 0 END,
                 fecha_actualizacion = GETDATE()
           WHERE sku = ? AND id_almacen = ?
        `;
        params = [delta, delta, delta, sku, almacenId];
        break;
        
       case 'reversión reserva':
        sqlText = `
            UPDATE inventory_service_db.dbo.inventario
                SET en_nota_venta = CASE WHEN en_nota_venta >= ? THEN en_nota_venta - ? ELSE 0 END,
                    fecha_actualizacion = GETDATE()
                WHERE sku = ? AND id_almacen = ?
        `;
        params = [delta, delta, sku, almacenId];
    break;

      default:
        throw new Error(`Movimiento desconocido: "${movType}"`);
    }

    const [result] = await query(sqlText, params);
    const affected = result.rowsAffected?.[0] ?? 0;
    if (!affected) {
      throw new Error(`No existe inventario para sku="${sku}" en almacen=${almacenId}`);
    }
  }
};

module.exports = InventoryRepository;
