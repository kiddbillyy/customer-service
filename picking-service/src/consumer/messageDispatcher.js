const pickingService = require('../services/pickingService');

module.exports = {
  'new.order.created': async (msg) => {
    console.log(`📥 [picking-service] new.order.created recibido:`, msg);
    try {
      await pickingService.handleNewOrderCreated(msg);
      console.log(`✅ Orden procesada correctamente en picking-service`);
    } catch (error) {
      console.error("❌ Error procesando new.order.created:", error);
      throw error; // Para que Kafka maneje reintentos si es necesario
    }
  },

'order.status.updated': async (msg) => {
    console.log(`📦 [picking-service] order.status.updated recibido:`, msg);
    try {
      await pickingService.handleOrderStatusUpdated(msg);
      console.log(`✅ Estado procesado correctamente en picking-service`);
    } catch (error) {
      console.error("❌ Error procesando order.status.updated:", error);
      throw error; // Para que Kafka maneje reintentos si es necesario
    }
  }
};