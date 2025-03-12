const kafka = require('../config/kafka');
const dispatcher = require('./messageDispatcher');

const consumer = kafka.consumer({ 
  groupId: 'packaging-service-group', 
  retry: { retries: 5 }
});

const consumeMessages = async () => {
  try {
    await consumer.connect();
    console.log('✅ Consumer de Packaging conectado a Kafka');

    await consumer.subscribe({ topic: 'bundle.created', fromBeginning: false });

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        const msg = JSON.parse(message.value.toString());
        console.log(`📥 Mensaje recibido de Kafka [${topic}]:`, msg);

        try {
          const handler = dispatcher[topic];
          if (handler) {
            await handler(msg);
          } else {
            console.warn(`⚠️ No existe un manejador para el tópico: ${topic}`);
          }

          await consumer.commitOffsets([
            { topic, partition, offset: (Number(message.offset) + 1).toString() }
          ]);
          await heartbeat();
        } catch (error) {
          console.error(`❌ Error procesando mensaje de ${topic}:`, error);
        }
      },
    });
  } catch (err) {
    console.error('❌ Error al iniciar el consumidor packaging-service:', err);
  }
};

module.exports = consumeMessages;
