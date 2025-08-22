// src/consumer/inventoryConsumer.js
const kafka      = require('../config/kafka');
const dispatcher = require('./messageDispatcher');

/**
 * Arranca el consumer de Inventory‑Service.
 * Llama a esta función desde server.js una vez que Express esté escuchando.
 * Devuelve la instancia de consumer por si quisieras cerrar la conexión
 * en una parada ordenada (SIGTERM).
 */
module.exports = async function startConsumer() {
  // ⚠️ El consumer se crea aquí dentro (no en la parte superior del módulo)
  const consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || 'inventory-service-group',
    retry: { retries: 5 },
  });

  try {
    await consumer.connect();
    console.log('✅ Consumer de Inventory conectado');

    // Suscripciones
    await consumer.subscribe({ topic: 'product.created.v1',   fromBeginning: false });
    await consumer.subscribe({ topic: 'stock.adjust.request', fromBeginning: false });
    await consumer.subscribe({ topic: 'new-product-created',  fromBeginning: false }); 

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        const msg = JSON.parse(message.value.toString());
        console.log(`📥 [${topic}]`, msg);

        try {
          if (dispatcher[topic]) {
            await dispatcher[topic](msg);               // delega en el handler
          } else {
            console.warn(`⚠️ No hay handler para: ${topic}`);
          }

          // Commit & heartbeat
          await consumer.commitOffsets([
            { topic, partition, offset: (Number(message.offset) + 1).toString() },
          ]);
          await heartbeat();
        } catch (err) {
          console.error(`❌ Error procesando ${topic}:`, err);
        }
      },
    });

    return consumer; // opcional, útil para shutdown limpio
  } catch (err) {
    console.error('❌ Error iniciando consumer:', err);
    throw err;       // deja que el caller decida qué hacer
  }
};
