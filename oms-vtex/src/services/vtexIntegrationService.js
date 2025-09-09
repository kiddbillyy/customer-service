// handlers/vtexHookHandler.js (o similar)
const { sendMessage } = require('../producer');

async function handleVtexIntegration(payload) {
  console.log('📥 Recibido VTEX hook payload:', payload);

  const topic = 'vtex.order.integration';

  await sendMessage(topic, {
    orderId: payload.OrderId,
    status : payload.State,
  }, { key: payload.OrderId }); // key para particionamiento estable (opcional)

  console.log(`✅ Mensaje enviado a Kafka [${topic}]: orderId=${payload.OrderId}`);
}


module.exports = { handleVtexIntegration };
