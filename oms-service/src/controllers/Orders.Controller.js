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

// GET /orders (lista o detalle por par)  y  GET /orders/:id (detalle por id)
async function getOrders(req, res) {
  try {
    const hasId   = !!req.params?.id;
    const hasPair = !!(req.query?.salesChannelReferenceId && req.query?.u_ref1);

    const opts = {
      // Estos flags solo aplican si el model entra en modo "detail"
      includeItems: req.query.includeItems !== 'false',
      includeFulfillment: req.query.includeFulfillment !== 'false',
      includeHistory: req.query.includeHistory !== 'false',
      valuesInCents: req.query.valuesInCents !== 'false',
    };

    // armamos el "query" que el model entiende (sirve para ambos modos)
    const query = {
      // identificadores de detalle si corresponden
      ...(hasId ? { orderID: parseInt(req.params.id, 10) } : {}),
      ...(hasPair ? {
        salesChannelReferenceId: String(req.query.salesChannelReferenceId),
        u_ref1: String(req.query.u_ref1),
      } : {}),

      // filtros/paginación de listado si NO hay id/par
      ...(hasId || hasPair ? {} : {
        salesChannelReferenceId: req.query.salesChannelReferenceId || undefined,
        u_ref1: req.query.u_ref1 || undefined,
        statusCode: req.query.statusCode || undefined,
        statusId: req.query.statusId ? Number(req.query.statusId) : undefined,
        createdFrom: req.query.createdFrom || undefined,
        createdTo: req.query.createdTo || undefined,
        search: req.query.search || undefined,
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 50,
      }),
    };

    if (hasId && Number.isNaN(query.orderID)) {
      return res.status(400).json({ message: 'orderID inválido' });
    }

    const data = await model.getOrder(query, opts);
    return res.status(200).json(data);
  } catch (err) {
    const map = { ORDER_NOT_FOUND: 404, QUERY_REQUIRED: 400 };
    console.error('getOrders error:', err);
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al obtener órdenes.' });
  }
}


async function getCustomersPendingIntegration(req, res) {
  try {
    const {
      createdFrom,       // opcional (ISO)
      createdTo,         // opcional (ISO, exclusivo)
      page = '1',
      pageSize = '100',
    } = req.query;

    const out = await model.getOrdersPendingCustomerIntegration({
      createdFrom,
      createdTo,
      page: Number(page),
      pageSize: Number(pageSize),
    });

    // out = { page, pageSize, total, rows: [ { ... , fulfillment: {...}, retryCustomer: {...} } ] }
    return res.status(200).json(out);
  } catch (err) {
    console.error('getCustomersPendingIntegration error:', err);
    return res
      .status(500)
      .json({ message: err?.message || 'Error al listar pendientes de integración de customer.' });
  }
}


module.exports = { createOrder, patchOrder, getOrders, getCustomersPendingIntegration };
