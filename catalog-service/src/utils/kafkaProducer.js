// services/kafkaUtils.js
const kafka = require('../config/kafka');

const producer = kafka.producer();

const connectProducer = async () => {
  await producer.connect();
  console.log('🟢 Kafka Producer conectado');
};

// Modificamos la función para que acepte un array de ItemCodes
const sendNewProductEvents = async (itemCodes) => {
  if (!producer) {
    return console.error('Producer no inicializado');
  }

  // Creamos un array de mensajes
  const messages = itemCodes.map(itemCode => ({
    value: JSON.stringify({ itemCode }),
  }));

  if (messages.length === 0) {
    console.log('No hay nuevos productos para enviar a Kafka.');
    return;
  }

  try {
    await producer.send({
      topic: 'new-product-created',
      messages, // Enviamos el array completo de mensajes
    });
    console.log(`📤 ${messages.length} eventos enviados a Kafka.`);
    console.log(`Último ItemCode enviado: ${itemCodes[itemCodes.length - 1]}`);
  } catch (error) {
    console.error('Error al enviar mensajes a Kafka:', error);
  }
};

module.exports = { connectProducer, sendNewProductEvents };