const { sendMessage } = require('../producer');

async function handleVtexIntegration(payload) {
    console.log('📥 Recibido VTEX hook payload:', payload);
  
    const topic = 'vtex.order.imported';

    // Mensaje para notificar el nuevo pedido
    await sendMessage(topic, {
      orderId: payload.OrderId,      
      state  : payload.State
    });
  
    console.log(`✅ Mensaje enviado a Kafka [${topic}]: orderId=${payload.OrderId}`);
  }

module.exports = { handleVtexIntegration };
