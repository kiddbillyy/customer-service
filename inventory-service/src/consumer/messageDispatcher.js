// src/consumer/messageDispatcher.js
const { sql, poolPromise } = require('../config/db');
const { sendMessage }      = require('../producer');

async function handleNewProduct(msg) {
  const sku = msg.sku?.trim();
  if (!sku) {
    console.error('❌ new-product-created sin sku');
    return;
  }

  const pool = await poolPromise;
  const now  = new Date();

  // 1️⃣  Crear fila inventario (0) en TODOS los almacenes activos
  await pool.request()
    .input('sku', sql.NVarChar(50), sku)
    .input('now', sql.DateTime, now)
    .query(`
      INSERT INTO dbo.inventario
            (sku, id_almacen, stock_fisico,
             en_nota_venta, en_orden_compra,
             fecha_creacion, fecha_actualizacion)
      SELECT @sku, alm.id_almacen, 0, 0, 0, @now, @now
        FROM dbo.almacenes alm
       WHERE alm.status = 'Activo'
         AND NOT EXISTS (
               SELECT 1 FROM dbo.inventario inv
                WHERE inv.sku = @sku
                  AND inv.id_almacen = alm.id_almacen
             );
    `);

  // 2️⃣  Traer lista de almacenes para publicar eventos
  const { recordset: rows } = await pool.request()
    .input('sku', sql.NVarChar(50), sku)
    .query(`
      SELECT id_almacen
        FROM dbo.inventario
       WHERE sku = @sku;
    `);

  // 3️⃣  Emitir inventory.updated.v1 (quantity = 0) por cada almacén
  for (const { id_almacen } of rows) {
    await sendMessage(
      process.env.STOCK_TOPIC || 'inventory.updated.v1',
      { sku, idAlmacen: id_almacen, quantity: 0 },
      sku
    );
  }

  console.log(
    `✅ Inventario inicial (0) creado para SKU ${sku} en ${rows.length} almacenes`
  );
}

module.exports = {
  'new-product-created': handleNewProduct
};
