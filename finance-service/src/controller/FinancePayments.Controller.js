const model = require('../models/FinancePayments.Model');

// POST /finance/payments
async function intakePayment(req, res) {
  try {
    const dto = req.body; // FinancePaymentDTO
    const out = await model.savePaymentIntake(dto);
    return res.status(201).json({ orderId: out.orderId, message: 'Pago recibido.' });
  } catch (err) {
    console.error(err);
    const map = {
      ORDER_ID_REQUIRED: 400
    };
    return res.status(map[err.message] || err.statusCode || 500)
      .json({ message: err.message || 'Error al recibir el pago.' });
  }
}

// GET /finance/payments/state/:orderId
async function getPaymentState(req, res) {
  try {
    const orderId = req.params.orderId;
    const st = await model.getState(orderId);
    if (!st) return res.status(404).json({ message: 'Orden no encontrada.' });
    return res.status(200).json({ state: st });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error al consultar estado.' });
  }
}

module.exports = { intakePayment, getPaymentState };
