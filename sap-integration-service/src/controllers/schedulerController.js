// src/controllers/schedulerController.js
const { processNewOrders, createNewOrder } = require('../services/sapSchedulerService');

exports.runScheduler = async (req, res) => {
  try {
    await processNewOrders();
    res.json({ message: 'Proceso completado. Revisa logs para más detalles.' });
  } catch (error) {
    console.error('❌ Error en runScheduler:', error);
    res.status(500).json({ message: 'Error al ejecutar el scheduler' });
  }
};

exports.createNewOrder = async (req, res) => {
  try {
    const { folionum } = req.params;
    if (!folionum) {
      return res.status(400).json({ message: 'El parámetro folionum es requerido' });
    }
    await createNewOrder(folionum);
    res.json({ message: 'Orden procesada correctamente. Revisa logs para más detalles.' });
  } catch (error) {
    console.error('❌ Error en createNewOrder controller:', error);
    res.status(500).json({ message: 'Error al procesar la orden' });
  }
};
