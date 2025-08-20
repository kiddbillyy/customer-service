const { getProducer } = require('./producerSingleton');

/**
 * Función genérica: envía cualquier payload JSON a cualquier tópico.
 */
async function sendMessage(topic, payload, key) {
  const producer = await getProducer();
  await producer.send({
    topic,
    messages: [{ key, value: JSON.stringify(payload) }],
  });
}

/**
 * Conveniencia de dominio: inventario actualizado.
 */
async function publishInventoryUpdated({ sku, idAlmacen, quantity }) {
  await sendMessage(
    process.env.STOCK_TOPIC || 'inventory.updated.v1',
    {
      eventId: Date.now().toString(),
      timestamp: new Date().toISOString(),
      source: 'inventory-service',
      data: { sku, idAlmacen, quantity },
    },
    sku
  );
  console.log(`🚚 Evento de stock emitido para SKU ${sku}`);
}

module.exports = {
  sendMessage,              // 👈  ahora el dispatcher lo encontrará
  publishInventoryUpdated,   // sigue disponible si otros módulos lo usan
};
