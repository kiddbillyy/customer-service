const kafka = require('../config/kafka');
const dispatcher = require('./messageDispatcher');

const consumer = kafka.consumer({
  groupId: 'user-service-group',
  retry: { retries: 5 },
});

const consumeMessages = async () => {
  try {
    await consumer.connect();
    console.log('✅ Consumer de User Service conectado a Kafka');

    // Suscribir a los tópicos que necesites
    await consumer.subscribe({ topic: 'user.deleted', fromBeginning: false });
    // ...

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        const msg = JSON.parse(message.value.toString());
        console.log(`📥 Mensaje recibido [${topic}]:`, msg);

        try {
          if (dispatcher[topic]) {
            await dispatcher[topic](msg);
          } else {
            console.warn(`⚠️ No existe manejador para el tópico ${topic}`);
          }
          await consumer.commitOffsets([{
            topic,
            partition,
            offset: (Number(message.offset) + 1).toString()
          }]);
          await heartbeat();
        } catch (error) {
          console.error(`❌ Error procesando mensaje de ${topic}:`, error);
        }
      },
    });
  } catch (err) {
    console.error('❌ Error iniciando consumer de user-service:', err);
  }
};

module.exports = consumeMessages;