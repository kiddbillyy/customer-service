// services/vtexStatusRouter.js
const { setOrderStartHandling } = require('./vtexOmsApi');

// Normaliza state a minúsculas para machear
function normalize(s) { return String(s || '').trim().toLowerCase(); }

/**
 * Devuelve una función que llama la API de VTEX para el estado dado,
 * o null si no hay acción hacia VTEX para ese estado.
 */
function resolveVtexAction(state) {
  const s = normalize(state);

  const map = {
    'start-handling'     : (orderId) => setOrderStartHandling(orderId),



  };

  return map[s] || null;
}

/**
 * @param {string} commerceId 
 * @param {string} state
 */
async function propagateToVtexIfNeeded({ commerceId, state }) {
  const action = resolveVtexAction(state);
  if (!action) {
    console.log(`↷ sin acción VTEX para state="${state}" (orderId=${commerceId})`);
    return { sent: 0 };
  }

  try {
    await action(commerceId);
    return { sent: 1 };
  } catch (e) {
    // aquí podrías publicar a una DLQ / tabla outbox para retry
    console.error(`❌ fallo al propagar a VTEX: orderId=${commerceId}, state=${state}`, e.message);
    throw e;
  }
}

module.exports = { propagateToVtexIfNeeded, resolveVtexAction };
