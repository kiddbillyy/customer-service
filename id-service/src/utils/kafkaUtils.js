const { Kafka, CompressionTypes } = require('kafkajs');
const kafka = require('../config/kafka');

const producer = kafka.producer();
let connected = false;

const connectProducer = async () => {
  if (!connected) {
    await producer.connect();
    connected = true;
    console.log('🟢 Kafka Producer conectado');
  }
};

const sendOtpEvent = async ({ to, code, template }) => {
  await connectProducer();

  const message = {
    topic: 'otp-recuperacion',
    messages: [
      {
        value: JSON.stringify({ to, code, template }), 
      },
    ],
    compression: CompressionTypes.GZIP,
  };

  try {
    await producer.send(message);
    console.log('📤 Evento OTP enviado a Kafka:', { to, code, template });
  } catch (err) {
    console.error('❌ Error al enviar OTP a Kafka:', err);
    throw err;
  }
};

module.exports = {
  connectProducer,
  sendOtpEvent,
};
