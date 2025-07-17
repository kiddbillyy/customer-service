// src/models/inventoryRepository.js
const pool = require('../config/db');
const sql  = require('mssql');  


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
  getAll: async () => {
    const [rows] = await pool.query(
      'SELECT TOP 10 * FROM inventory_service_db.dbo.inventario;'
    );
    return rows;
  },
getInventoriesWithPriorityOnly: async (sku) => {
  const request = pool.request();
  request.input('sku', sql.VarChar, sku);

  const query = `
    SELECT
      inv.sku,
      inv.id_almacen,
      alm.nombre,
      alm.prioridad,
      inv.disponible
    FROM inventario inv
    JOIN almacenes alm ON alm.id_almacen = inv.id_almacen
    WHERE inv.sku = @sku
      AND alm.status = 'Activo'
      AND alm.prioridad IS NOT NULL
  `;

  const result = await request.query(query);
  return { data: result.recordset };
},
  getAllProducts: async (filters, page = 1) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const request = pool.request();
  request.input('offset', sql.Int, offset);

  const whereSql = buildWhere(filters, request);

  const queryData = `
        SELECT
      prod.u_imagen,
      inv.sku,
      prod.itemname,
      inv.id_almacen,
      alm.nombre,
      alm.ubicacion,
      prod.units,
      inv.disponible,
      prod.createdate,
      prod.u_name,
      prod.updatedate,
      prod.activo,
      inv.stock_fisico,
      inv.en_nota_venta,
      inv.en_orden_compra
      FROM inventario inv
      JOIN productos prod ON prod.itemcode = inv.sku
      JOIN almacenes alm  ON alm.id_almacen = inv.id_almacen
    ${whereSql}
    order by prod.u_imagen desc, id_almacen asc
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

  return {
    data: dataResult.recordset,
    totalItems,
    totalPages,
    page: pageNum
  };
},

  applyMovement: async ({ sku, almacenId, delta, movType }) => {
    let sqlQuery, params;

    switch (movType) {
      /* ----- ENTRADA (ya funciona) ----- */
      case 'entrada':
        sqlQuery = `
          UPDATE inventory_service_db.dbo.inventario
             SET en_nota_venta = CASE
                                   WHEN en_nota_venta >= ? THEN en_nota_venta - ?
                                   ELSE 0
                                 END,
                 stock_fisico  = stock_fisico + CASE
                                                   WHEN en_nota_venta >= ? THEN 0
                                                   ELSE ? - en_nota_venta
                                                 END,
                 fecha_actualizacion = GETDATE()
           WHERE sku        = ?
             AND id_almacen = ?
        `;
        params = [delta, delta, delta, delta, sku, almacenId];
        break;

      /* ----- SALIDA (sin reservas) ----- */
      case 'salida':
        sqlQuery = `
          UPDATE inventory_service_db.dbo.inventario
             SET stock_fisico        = stock_fisico - ?,
                 fecha_actualizacion = GETDATE()
           WHERE sku        = ?
             AND id_almacen = ?
        `;
        params = [delta, sku, almacenId];
        break;

      /* ----- RESERVA: solo aumenta en_nota_venta ----- */
      case 'reserva':
        sqlQuery = `
          UPDATE inventory_service_db.dbo.inventario
             SET en_nota_venta       = en_nota_venta + ?,
                 fecha_actualizacion = GETDATE()
           WHERE sku        = ?
             AND id_almacen = ?
        `;
        params = [delta, sku, almacenId];
        break;

      /* ----- ENTREGA: despacha unidades reservadas ----- */
      case 'entrega':
        sqlQuery = `
          UPDATE inventory_service_db.dbo.inventario
             SET stock_fisico  = stock_fisico - ?,
                 en_nota_venta = CASE
                                   WHEN en_nota_venta >= ? THEN en_nota_venta - ?
                                   ELSE 0
                                 END,
                 fecha_actualizacion = GETDATE()
           WHERE sku        = ?
             AND id_almacen = ?
        `;
        params = [delta, delta, delta, sku, almacenId];
        break;

      default:
        throw new Error(`Movimiento desconocido: "${movType}"`);
    }

    const [result] = await pool.query(sqlQuery, params);
    const affected = result.rowsAffected?.[0] ?? 0;
    if (affected === 0) {
      throw new Error(
        `No existe inventario para sku="${sku}" en almacen=${almacenId}`
      );
    }
  }
};

module.exports = InventoryRepository;
