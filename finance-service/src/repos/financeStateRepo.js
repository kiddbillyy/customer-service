const state = new Map();

async function getState(orderId) {
  return state.get(orderId) || null;
}

async function saveState(orderId, patch) {
  const prev = state.get(orderId) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  state.set(orderId, next);
  return next;
}

module.exports = { getState, saveState };
