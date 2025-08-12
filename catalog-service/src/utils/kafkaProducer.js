// services/kafkaUtils.js
const { CompressionTypes } = require('kafkajs');
const kafka = require('../config/kafka');

const producer = kafka.producer();
const BATCH_SIZE = 500;               // ← tamaño de lote

const connectProducer = async () => {
  await producer.connect();
  console.log('🟢 Kafka Producer conectado');
};

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

const sendPriceListEvents = async (priceLists) => {
  if (!producer) {
    console.error('Producer no inicializado');
    return;
  }
  if (!Array.isArray(priceLists) || priceLists.length === 0) {
    console.log('No hay listas de precios para enviar a Kafka.');
    return;
  }

  for (let i = 0; i < priceLists.length; i += BATCH_SIZE) {
    const slice = priceLists.slice(i, i + BATCH_SIZE);
    const messages = slice.map(pl => ({
      value: JSON.stringify({
        listNum: pl.ListNum,
        listName: pl.ListName,
        createDate: pl.CreateDate
      }),
    }));

    try {
      await producer.send({
        topic: 'sap.price-list.sync',
        messages,
        compression: CompressionTypes.GZIP,
      });
      console.log(`📤 Enviado batch listas de precios: ${messages.length}`);
    } catch (error) {
      console.error('Error al enviar batch de listas de precios a Kafka:', error);
      throw error;
    }
  }
};
module.exports = { connectProducer, sendNewProductEvents, sendPriceListEvents };
