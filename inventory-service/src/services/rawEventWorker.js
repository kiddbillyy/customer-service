const RawRepo       = require('../models/rawEventsRepository');
const InventoryRepo = require('../models/inventoryRepository');

/* Convierte event_type ('entrada' | 'salida' | 'entrega') en movType válido para applyMovement */
const normalize = (eventType) => eventType;   // ya coincide con tu applyMovement()

async function processRawEvents () {
  const events = await RawRepo.getPending(200);
  if (!events.length) return;

  for (const e of events) {
    const data = JSON.parse(e.payload);

    const movType   = normalize(e.event_type);    // 'entrada'|'salida'|'entrega'
    const delta     = Math.abs(parseFloat(data.Quantity));
    const almacenId = parseInt(data.WhsCode, 10);
    const sku       = data.ItemCode.trim();

    try {
      await InventoryRepo.applyMovement({ sku, almacenId, delta, movType });
      await RawRepo.markDone(e.id);
      console.log(`✔︎ raw_event ${e.id} aplicado`);
    } catch (err) {
      await RawRepo.markError(e.id, err.message);
      console.error(`❌ raw_event ${e.id}:`, err.message);
    }
  }
}

module.exports = { processRawEvents };
