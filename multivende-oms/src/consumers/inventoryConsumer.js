// src/consumers/inventoryConsumer.js
import { getKafka } from '../services/kafka.js';
import { logger } from '../utils/logger.js';
import { bulkSetMVInventory, updateMVInventorySingle } from '../services/mvInventory.js';

function resolveWarehouseId(warehouseCode) {
  if (!warehouseCode) return null;
  const byVar = process.env[`MV_WH_${warehouseCode}`];
  if (byVar) return byVar;
  try {
    const map = process.env.MV_WH_MAP ? JSON.parse(process.env.MV_WH_MAP) : null;
    if (map && map[warehouseCode]) return map[warehouseCode];
  } catch {
    logger.warn('[INV-CONSUMER] MV_WH_MAP no es JSON válido');
  }
  return null;
}

export async function startInventoryConsumer() {
  const topic = process.env.KAFKA_INVENTORY_TOPIC || 'inventory.warehouse.03.updated';
  const groupId = process.env.KAFKA_INVENTORY_GROUP || 'mv-oms-inventory-sync';

  const kafka = getKafka();
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  logger.info(`[INV-CONSUMER] Subscribed to ${topic} (groupId=${groupId})`);

  // 👇 DEFAULT hardcodeado (o vía env si prefieres)
  const DEFAULT_WAREHOUSE_ID = process.env.MV_DEFAULT_WAREHOUSE_ID
    || '8e80184c-db12-467e-922c-dd2c1ad8f63a';

  await consumer.run({
    eachMessage: async ({ message, heartbeat }) => {
      const raw = message.value?.toString() || '{}';
      let data;
      try {
        const parsed = JSON.parse(raw);
        data = parsed?.data || parsed;
      } catch {
        logger.error({ raw }, '[INV-CONSUMER] Mensaje no es JSON');
        return;
      }

      logger.info({ evt: data?.event || '', raw: data }, '[INV-CONSUMER] Recibido');

      const warehouseCode = data?.warehouseCode || data?.whCode || null;
      // 👇 Usamos SIEMPRE el default; si no hay, caemos al resolver
      const whId = DEFAULT_WAREHOUSE_ID || resolveWarehouseId(warehouseCode);

      // Caso lote
      if (Array.isArray(data?.changes) && data.changes.length > 0) {
        const items = data.changes
          .map(ch => ({
            code: ch?.sku || ch?.code,
            amount: Number(ch?.qty ?? ch?.quantity ?? ch?.stock ?? ch?.amount),
          }))
          .filter(x => x.code && !Number.isNaN(x.amount));

        logger.info({ warehouseCode, warehouseId: whId, count: items.length }, '[INV-CONSUMER] Recibido cambio(s)');

        if (!whId) {
          logger.error({ warehouseCode }, '[INV-CONSUMER] No se pudo resolver warehouseId de MV');
          return;
        }
        if (items.length === 0) {
          logger.warn('[INV-CONSUMER] Lote sin items válidos — nada que enviar');
          return;
        }

        try {
          await bulkSetMVInventory({ warehouseId: whId, items });
        } catch (err) {
          logger.error({ err: err.message, warehouseId: whId }, '[INV-CONSUMER] Error integrando a MV (bulk)');
        } finally {
          await heartbeat().catch(() => {});
        }
        return;
      }

      // Caso unitario
      const sku = data?.sku || data?.code || data?.productCode;
      const quantity = Number(data?.quantity ?? data?.qty ?? data?.stock);
      if (!sku || Number.isNaN(quantity)) {
        logger.error({ data }, '[INV-CONSUMER] Faltan sku o quantity');
        return;
      }

      logger.info({ sku, quantity, warehouseCode, warehouseId: whId }, '[INV-CONSUMER] Recibido cambio unitario');

      if (!whId) {
        logger.error({ warehouseCode }, '[INV-CONSUMER] No se pudo resolver warehouseId de MV para unitario');
        return;
      }

      try {
        await updateMVInventorySingle({ warehouseId: whId, sku, quantity });
      } catch (err) {
        logger.error({ err: err.message, sku, quantity }, '[INV-CONSUMER] Error integrando a MV (unitario)');
      } finally {
        await heartbeat().catch(() => {});
      }
    },
  });

  return consumer;
}
