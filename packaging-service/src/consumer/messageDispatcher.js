const bundlesService = require('../services/bundlesService')

module.exports = {
  'bundle.created': async (msg) => {
    console.log(`📦 [packaging-service] bundle.created recibido:`, msg);
    try {
      await bundlesService.handleBundleCreated(msg);
      console.log(`✅ Evento bundle.created procesado correctamente en Packaging Service`);
    } catch (error) {
      console.error("❌ Error procesando bundle.created en Packaging Service:", error);
      throw error; // Para que Kafka maneje reintentos si es necesario
    }
  },
};
