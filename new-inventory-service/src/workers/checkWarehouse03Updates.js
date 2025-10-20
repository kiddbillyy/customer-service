// src/workers/checkWarehouse03Updates.js
const { getPool } = require('../config/db');
const { Kafka } = require('kafkajs');

// Utilidad: obtener hora local de Santiago
function getChileTime(date = new Date()) {
  // convierte la fecha UTC a la zona horaria de Chile
  const localStr = date.toLocaleString('en-US', { timeZone: 'America/Santiago' });
  return new Date(localStr);
}

async function emitWarehouse03Updates(updates, lastRunAt, runAt) {
  const kafka = new Kafka({
    clientId: 'inventory-service',
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(',')
  });

  const producer = kafka.producer();
  await producer.connect();

  const payload = {
    warehouseCode: '03',
    changes: updates.map(u => ({
      sku: u.itemSku,
      qty: Number(u.onHandQty)
    })),
    lastRunAt,
    runAt
  };

  console.log('📤 [Kafka] Payload enviado:', JSON.stringify(payload, null, 2));

  await producer.send({
    topic: process.env.TOPIC_INV_WHS03_UPDATED || 'inventory.warehouse.03.updated',
    messages: [{ key: '03', value: JSON.stringify(payload) }]
  });

  await producer.disconnect();
  console.log(`📤 Kafka: evento enviado con ${updates.length} cambios.`);
}

async function checkWarehouse03Updates() {
  const pool = await getPool();
  const cronName = 'CheckWarehouse03Updates';

  try {
    // 🕒 Obtener última ejecución
    const lastRunQuery = `
      SELECT lastRunAt FROM dbo.CronState WHERE cronName = @cronName
    `;
    const lastRunRes = await pool
      .request()
      .input('cronName', cronName)
      .query(lastRunQuery);

    const lastRunAt = lastRunRes.recordset[0]?.lastRunAt || new Date(0);

    // 📦 Buscar actualizaciones en el almacén 03 después de lastRunAt
    const updatesQuery = `
      SELECT itemSku, warehouseCode, onHandQty, updatedAt
      FROM dbo.ItemWarehouseStock
      WHERE warehouseCode = '03'
        AND updatedAt > @lastRunAt
      ORDER BY updatedAt DESC;
    `;

    const { recordset: updates } = await pool
      .request()
      .input('lastRunAt', lastRunAt)
      .query(updatesQuery);

    const nowUtc = new Date();
    const nowChile = getChileTime(nowUtc);

    if (updates.length > 0) {
      console.log(`📦 ${updates.length} registros actualizados en almacén 03 desde ${lastRunAt.toISOString()}`);
      await emitWarehouse03Updates(updates, lastRunAt.toISOString(), nowUtc.toISOString());
    } else {
      console.log(`✅ Sin cambios en almacén 03 desde ${lastRunAt.toISOString()}`);
    }

    // 🕐 Actualizar hora de última ejecución (hora local Chile)
    await pool.request()
      .input('cronName', cronName)
      .input('lastRunAt', nowChile)
      .query(`
        UPDATE dbo.CronState SET lastRunAt = @lastRunAt WHERE cronName = @cronName;
      `);

    console.log(`🕓 Cron ejecutado: ${nowChile.toLocaleString('es-CL', { timeZone: 'America/Santiago' })} (hora local), ${nowUtc.toISOString()} (UTC)`);

  } catch (err) {
    console.error('[CRON ERROR]', err.message || err);
  }
}

module.exports = { checkWarehouse03Updates };
