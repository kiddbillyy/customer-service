import sql from 'mssql';
import { IdServicePool, IdServicePoolConnect } from '../../../config/dbnew';
import { fetchVtexOrder } from '../../../services/vtexService';
import { buildOmsPayload } from '../../../services/omsMapper';
import { postOrderToOms } from '../../../services/omsService';
import { updateOrderWithOmsId, setOrderErrorIntegration } from '../path/to/tuConsumerHelpers.js';

async function getFailedOrders(limit = 50) {
  await IdServicePoolConnect;
  const req = new sql.Request(IdServicePool);
  req.input('limit', sql.Int, limit);
  const result = await req.query(`
    SELECT TOP (@limit) id, commerceId, errorIntegration
    FROM dbo.Orders
    WHERE statusIntegration = 0
      AND (errorIntegration IS NOT NULL OR errorIntegration <> '')
    ORDER BY updatedAt DESC
  `);
  return result.recordset;
}

async function retryOrder(order) {
  try {
    console.log(`🔄 Reintento orderPkId=${order.id}, commerceId=${order.commerceId}`);

    // Traer detalle desde VTEX (necesario para payload)
    const vtexData = await fetchVtexOrder(order.commerceId);
    if (!vtexData) throw new Error('VTEX_DATA_NOT_FOUND');

    // Construir y postear
    const payload  = buildOmsPayload(vtexData, { orderId: order.commerceId });
    const response = await postOrderToOms(payload);

    // Procesar outcome (igual que en el consumer)
    const id = response?.data?.id ?? null;
    const message = response?.data?.message ?? null;

    if (id) {
      await updateOrderWithOmsId(order.id, id);
      await setOrderErrorIntegration(order.id, null);
      console.log(`✅ OMS reintento OK: ${id}`);
    } else {
      await setOrderErrorIntegration(order.id, message ?? 'UNKNOWN_RESPONSE');
      console.warn(`⚠️ OMS reintento fallido: ${message}`);
    }
  } catch (e) {
    await setOrderErrorIntegration(order.id, e.message);
    console.error(`❌ OMS reintento error:`, e.message);
  }
}

async function run() {
  const batch = await getFailedOrders(20);
  for (const order of batch) {
    await retryOrder(order);
  }
}

run().then(() => process.exit(0));
