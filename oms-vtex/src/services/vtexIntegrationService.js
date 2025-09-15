// handlers/vtexHookHandler.js (o similar)
const { sendMessage } = require('../producer');

async function handleVtexIntegration(payload) {
  const topic = 'vtex.order.integration';
  if (!payload?.OrderId) return;
  
  await sendMessage(topic, {
    orderId: payload.OrderId,
    status : payload.State,
  }, { key: payload.OrderId });

}


module.exports = { handleVtexIntegration };