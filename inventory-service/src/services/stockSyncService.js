const SapMovRepository = require('../models/sapMovRepository');
const RawRepo          = require('../models/rawEventsRepository');

/* Construimos la clave natural con ID (único) */
const buildNaturalKey = (row) =>
  `SAP-${row.ID}`;   // tu SP garantiza unicidad de ID

async function syncMovements () {
  const movs = await SapMovRepository.getPending();   // Estado='pendiente'

  for (const mov of movs) {
    const naturalKey = buildNaturalKey(mov);
    const eventType  = mov.Movimiento.trim().toLowerCase();  // 'entrada' | 'salida' | 'entrega'

    try {
      await RawRepo.insertIfNew({
        source:    'SAP',
        eventType,            // se guarda tal cual
        naturalKey,
        payload:   mov
      });

      await SapMovRepository.markAsProcessed(mov.ID, true);
      console.log(`➕ Evento SAP ${mov.ID} (${eventType}) registrado`);
    } catch (err) {
      console.error(`✖︎ SAP ${mov.ID}:`, err.message);
      await SapMovRepository.markAsProcessed(mov.ID, false, err.message);
    }
  }
}

module.exports = { syncMovements };
