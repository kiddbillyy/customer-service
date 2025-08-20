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
      console.log('✅ [Kafka Producer] Conectado (sap-integration-service)');
    }
  }

  async sendMessage(topic, message) {
    try {
      await this.connect();
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }]
      });
      console.log(`📤 Mensaje enviado a Kafka [${topic}]:`, message);
    } catch (error) {
      console.error('❌ Error enviando mensaje a Kafka:', error);
      // Se podría implementar un mecanismo de reintento aquí
    }
  }
}

const instance = new ProducerSingleton();
module.exports = instance;
