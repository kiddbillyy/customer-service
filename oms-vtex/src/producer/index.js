// producer/index.js
const { sendBatch } = require('../utils/kafkaProducer');

const sendMessage = async (topic, message, { key, headers } = {}) => {
  const messages = [
    {
      key: key != null ? String(key) : undefined,    // opcional, recomendable: usar orderId
      value: JSON.stringify(message),
      headers,                                       // opcional
    }
  ];
  await sendBatch(topic, messages);
  console.log(`📤 Mensaje enviado a Kafka [${topic}]`, message);
};

module.exports = { sendMessage };
