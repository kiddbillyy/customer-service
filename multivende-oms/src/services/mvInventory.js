// src/services/mvInventory.js
import { logger } from '../utils/logger.js';
import { getAccessToken } from './multivendeApi.js'; // 👈 usar el token centralizado

const MV_BASE_URL = process.env.MV_BASE_URL; // p.ej. https://app.multivende.com

/**
 * Envía un LOTE (bulk) de items a una bodega (warehouse) en MV.
 * @param {string} warehouseId  ID de MV de la bodega
 * @param {Array<{code:string, amount:number}>} items
 */
export async function bulkSetMVInventory({ warehouseId, items }) {
  if (!MV_BASE_URL) throw new Error('MV_BASE_URL no configurado');
  if (!warehouseId) throw new Error('warehouseId requerido para bulk-set');
  if (!Array.isArray(items) || items.length === 0) {
    logger.info('[MV] bulkSet sin items — nada que enviar');
    return;
  }

  const url = `${MV_BASE_URL}/api/product-stocks/stores-and-warehouses/${warehouseId}/bulk-set`;

  // token desde el flujo OAuth centralizado
  const token = await getAccessToken();
  if (!token) throw new Error('No access token available for Multivende (inventario)');

  const chunkSize = Number(process.env.MV_STOCK_BULK_CHUNK || 100);
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`MV ${res.status}: ${txt}`);
    }

    logger.info(
      { warehouseId, count: chunk.length },
      '[MV] bulk-set aplicado'
    );
  }
}

/**
 * Versión unitaria: recibe un SKU y quantity -> lo manda como array de 1 elemento.
 * @param {string} warehouseId
 * @param {{ sku:string, quantity:number }} param1
 */
export async function updateMVInventorySingle({ warehouseId, sku, quantity }) {
  return bulkSetMVInventory({
    warehouseId,
    items: [{ code: sku, amount: Number(quantity) }],
  });
}
