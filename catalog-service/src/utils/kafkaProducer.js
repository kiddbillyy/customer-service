const kafka = require('../config/kafka');

const producer = kafka.producer();

const connectProducer = async () => {
  await producer.connect();
  console.log('🟢 Kafka Producer conectado');
};

const sendNewProductEvent = async (itemCode) => {
  if (!producer) return console.error('Producer no inicializado');
  await producer.send({
    topic: 'new-product-created',
    messages: [{ value: JSON.stringify({ itemCode }) }],
  });
  console.log(`📤 Evento enviado a Kafka con itemCode: ${itemCode}`);
};

module.exports = { connectProducer,sendNewProductEvent };
