const SapMovRepository  = require('../models/sapMovRepository');
const { applyMovement } = require('../models/inventoryRepository');

async function syncMovements() {
  const movs = await SapMovRepository.getPending();

  for (const mov of movs) {
    const { ID, ItemCode, Quantity, Movimiento: rawMov, WhsCode } = mov;
    const movType  = rawMov.trim().toLowerCase();          // 'entrada' | 'salida' | 'entrega'
    const qty      = parseFloat(Quantity);                 // aseguramos número
    const almacenId= parseInt(WhsCode, 10);
    const delta    = qty;                                  // siempre positivo aquí

    try {
      await applyMovement({
        sku:       ItemCode.trim(),
        almacenId,
        delta,
        movType
      });

      await SapMovRepository.markAsProcessed(ID, true);
      console.log(`✔️  Movimiento ${ID} (${movType}) procesado`);
    } catch (err) {
      console.error(`❌ Movimiento ${ID} falló:`, err.message);
      await SapMovRepository.markAsProcessed(ID, false, err.message);
    }
  }
}

module.exports = { syncMovements };
