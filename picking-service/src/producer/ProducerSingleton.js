const kafka = require('../config/kafka');

class ProducerSingleton {
  constructor() {
    if (!ProducerSingleton.instance) {
      this.producer = kafka.producer();
      this.connected = false;
      ProducerSingleton.instance = this;
    }
    return ProducerSingleton.instance;
  }

  async connect() {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
      console.log('✅ [Kafka Producer] Conectado al cluster (picking-service)');
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      console.log('❎ [Kafka Producer] Desconectado del cluster (picking-service)');
    }
  }

  async sendMessage(topic, message) {
    try {
      await this.connect(); // Aseguramos conexión antes de enviar
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }],
      });
      console.log(`📤 Mensaje enviado a Kafka [${topic}]:`, message);
    } catch (error) {
      console.error('❌ Error enviando mensaje a Kafka (picking-service):', error);
    }
  }
}

const instance = new ProducerSingleton();
// NO usamos Object.freeze, así podemos modificar "connected" internamente
module.exports = instance;