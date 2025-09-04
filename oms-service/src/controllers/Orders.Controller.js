// controllers/Orders.Controller.js
const model = require('../models/Orders.Models');

let publishOrderEvent = null;
let publishValidCustomerEvent = null;

try {
  ({ publishOrderEvent, publishValidCustomerEvent } = require('../utils/Kafka/OrderEvents'));
} catch { /* opcional: si falla el require, seguimos sin publicar */ }

// POST /orders  -> crea nueva orden (409 si ya existe por (salesChannelReferenceId,u_ref1))
async function createOrder(req, res) {
  try {
    const user = req.body?.user || 'API';
    const out = await model.createOrderWithItems(req.body);

    const orderPayload = {
      ...out,
      fulfillment: req.body?.fulfillment ?? out?.fulfillment ?? out?.Fulfillment,
      items: Array.isArray(req.body?.items) ? req.body.items : (out?.items || out?.Items),
    };

    (async () => {
      try {
        if (publishOrderEvent) {
          await publishOrderEvent({
            action: 'order.created',
            order: orderPayload,
            userId: user,
          });
        }
      } catch (e) {
        console.error('Kafka publish order.created failed:', e);
      }

      try {
        if (publishValidCustomerEvent) {
          await publishValidCustomerEvent({
            action: 'customer.valid',
            order: orderPayload, 
            userId: user,
          });
        }
      } catch (e) {
        console.error('Kafka publish valid-customer failed:', e);
      }
    })();

    return res.status(201).json({
      id: String(out.orderID),
      message: 'Orden creada.',
      itemsInserted: out.itemsInserted,
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

    // Arma el payload para Kafka; agrega fulfillment sólo si viene en el PATCH
    const orderPayload = {
      orderID,
      statusChanged: out.statusChanged,
      itemsUpserted: out.itemsUpserted,
      ...(req.body?.fulfillment ? { fulfillment: req.body.fulfillment } : {}),
    };

    (async () => {
      try {
        if (publishOrderEvent) {
          await publishOrderEvent({
            action: 'order.updated',
            order: orderPayload,
            userId: user,
          });
        }
      } catch (e) {
        console.error('Kafka publish order.updated failed:', e);
      }

      try {
        if (req.body?.fulfillment && publishValidCustomerEvent) {
          await publishValidCustomerEvent({
            action: 'customer.updated',
            order: { orderID, fulfillment: req.body.fulfillment },
            userId: user,
          });
        }
      } catch (e) {
        console.error('Kafka publish valid-customer (on PATCH) failed:', e);
      }
    })();

    return res.status(200).json({
      id: String(orderID),
      message: 'Orden actualizada.',
      statusChanged: out.statusChanged,
      itemsUpserted: out.itemsUpserted,
      fulfillmentChanged: out.fulfillmentChanged ?? false,
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
