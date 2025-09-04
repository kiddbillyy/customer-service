// controllers/Orders.Controller.js
const model = require('../models/Orders.Models');
let publishOrderEvent = null;
try {
  ({ publishOrderEvent } = require('../utils/Kafka/OrderEvents'));
} catch { /* opcional */ }

// POST /orders  -> crea nueva orden (409 si ya existe por (salesChannelReferenceId,u_ref1))
async function createOrder(req, res) {
  try {
    const user = req.body?.user || 'API';
    const out = await model.createOrderWithItems(req.body);

    (async () => {
      try {
        if (publishOrderEvent) {
          await publishOrderEvent({
            action: 'order.created',
            order: { orderID: out.orderID, itemsInserted: out.itemsInserted },
            userId: user,
          });
        }
      } catch (e) { console.error('Kafka publish order.created failed:', e); }
    })();

    return res.status(201).json({
      id: String(out.orderID),
      message: 'Orden creada.',
      itemsInserted: out.itemsInserted
    });
  } catch (err) {
    const map = {
      STATUS_NOT_FOUND: 400,
      ORDER_EXISTS: 409,
      ITEM_INDEX_REQUIRED: 400,
      DUPLICATE_ITEM_INDEX: 409,
      ITEM_REQUIRED_FIELDS: 400,
    };
    console.error('createOrder error:', err);
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al crear la orden.' });
  }
}

// PATCH /orders/:id  -> actualiza parcial (header/estado/items)
async function patchOrder(req, res) {
  try {
    const orderID = parseInt(req.params.id, 10);
    if (Number.isNaN(orderID)) return res.status(400).json({ message: 'orderID inválido' });

    const user = req.body?.user || 'API';
    const out = await model.patchOrder({ orderID, body: req.body });

    (async () => {
      try {
        if (publishOrderEvent) {
          await publishOrderEvent({
            action: 'order.updated',
            order: {
              orderID,
              statusChanged: out.statusChanged,
              itemsUpserted: out.itemsUpserted
            },
            userId: user,
          });
        }
      } catch (e) { console.error('Kafka publish order.updated failed:', e); }
    })();

    return res.status(200).json({
      id: String(orderID),
      message: 'Orden actualizada.',
      statusChanged: out.statusChanged,
      itemsUpserted: out.itemsUpserted
    });
  } catch (err) {
    const map = {
      ORDER_NOT_FOUND: 404,
      STATUS_NOT_FOUND: 400,
      ITEM_INDEX_REQUIRED: 400,
      DUPLICATE_ITEM_INDEX: 409,
      ITEM_REQUIRED_FIELDS: 400,
    };
    console.error('patchOrder error:', err);
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al actualizar la orden.' });
  }
}

module.exports = { createOrder, patchOrder };
