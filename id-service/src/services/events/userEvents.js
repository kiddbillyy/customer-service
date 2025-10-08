const { CompressionTypes } = require('kafkajs');
const kafka = require('../../config/kafka');

const producer = kafka.producer();
let connected = false;

async function ensureConnected() {
  if (!connected) {
    await producer.connect();
    connected = true;
    console.log('🟢 Kafka Producer conectado (user events)');
  }
}

/**
 * Emite evento cuando se crea un usuario con rol Vendedor
 * payload: { usuarioId, correoElectronico, nombres, apellidos, rut, telefono }
 */
async function emitSellerCreated(payload) {
  await ensureConnected();
  await producer.send({
    topic: 'seller.created', 
    compression: CompressionTypes.GZIP,
    messages: [
      {
        key: String(payload.usuarioId), 
        value: JSON.stringify(payload),
      },
    ],
  });
  console.log('📤 Evento seller.created enviado:', payload);
}

module.exports = { emitSellerCreated };
