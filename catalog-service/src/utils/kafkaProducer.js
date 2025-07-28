// services/kafkaUtils.js
const { CompressionTypes } = require('kafkajs');
const kafka = require('../config/kafka');

const producer = kafka.producer();
const BATCH_SIZE = 500;               // ← tamaño de lote

const connectProducer = async () => {
  await producer.connect();
  console.log('🟢 Kafka Producer conectado');
};

/**
 * Envía uno o más ItemCodes como eventos de producto nuevo.
 * Se parte en lotes de 500 y se comprime con GZIP para evitar
 * el error MESSAGE_TOO_LARGE (1 MB por ProduceRequest en el broker).
 */
const sendNewProductEvents = async (itemCodes) => {
  if (!producer) {
    console.error('Producer no inicializado');
    return;
  }
  if (!Array.isArray(itemCodes) || itemCodes.length === 0) {
    console.log('No hay nuevos productos para enviar a Kafka.');
    return;
  }

  for (let i = 0; i < itemCodes.length; i += BATCH_SIZE) {
    const slice = itemCodes.slice(i, i + BATCH_SIZE);

    const messages = slice.map(itemCode => ({
      value: JSON.stringify({ itemCode }),
    }));

    try {
      await producer.send({
        topic: 'new-product-created',
        messages,
        compression: CompressionTypes.GZIP,
      });
      console.log(
        `📤 Mensaje enviado a Kafka ${(i / BATCH_SIZE) + 1}: ` +
        `${messages.length} eventos enviados (último ItemCode: ${slice[slice.length - 1]})`
      );
    } catch (error) {
      console.error('Error al enviar batch a Kafka:', error);
      // Decide si quieres lanzar o continuar con el siguiente batch
      throw error;
    }
  }
};

module.exports = { connectProducer, sendNewProductEvents };
