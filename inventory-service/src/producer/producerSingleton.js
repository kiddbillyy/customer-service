const kafka = require('../config/kafka');

let _producer;

async function getProducer() {
  if (!_producer) {
    _producer = kafka.producer();
    await _producer.connect();
    console.log('✅ Kafka producer conectado');
  }
  return _producer;
}

module.exports = { getProducer };
