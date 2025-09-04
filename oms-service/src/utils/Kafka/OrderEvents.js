// utils/kafka/OrdersEvents.js
const { v4: uuidv4 } = require('uuid');
const { sendBatch } = require('../kafkaProducer');
const { nowSCLIso } = require('../dates');

const TOPIC = process.env.KAFKA_TOPIC_ORDER;
const MAX_ITEMS_IN_PAYLOAD = parseInt(process.env.KAFKA_ORDER_ITEMS_LIMIT, 10);

function ensureHeaders(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v == null ? '' : String(v);
  return out;
}
const pick = (o, ...keys) => {
  for (const k of keys) {
    if (o && Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) return o[k];
  }
  return undefined;
};

function pickItemFields(i = {}) {
  return {
    ItemIndex:      pick(i, 'itemIndex', 'ItemIndex', 'index'),
    UniqueId:       pick(i, 'uniqueId', 'UniqueId'),
    LineNum:        pick(i, 'lineNum', 'LineNum'),
    Itemcode:       pick(i, 'itemcode', 'Itemcode', 'sku', 'id', 'productId'),
    Dscription:     pick(i, 'dscription', 'description', 'Dscription', 'name'),
    Quantity:       pick(i, 'quantity', 'qty', 'Quantity'),
    PriceAfterVAT:  pick(i, 'priceAfterVAT', 'PriceAfterVAT', 'price', 'sellingPrice'),
    Codebars:       pick(i, 'codebars', 'ean', 'Codebars'),
    ImageUrl:       pick(i, 'imageUrl', 'ImageUrl'),
    Whscode:        pick(i, 'whscode', 'Whscode'),
    CategoryLeafId:   pick(i, 'categoryLeafId', 'CategoryLeafId'),
    CategoryLeafName: pick(i, 'categoryLeafName', 'CategoryLeafName'),
    CategoryPathIds:  pick(i, 'categoryPathIds', 'CategoryPathIds'),
    CategoryPathNames:pick(i, 'categoryPathNames', 'CategoryPathNames'),
  };
}
function pickOrderFields(o = {}) {
  return {
    OrderID:                 pick(o, 'orderID', 'OrderID', 'id', 'Id'),
    SalesChannelReferenceId: pick(o, 'salesChannelReferenceId', 'SalesChannelReferenceId'),
    URef1:                   pick(o, 'u_ref1', 'URef1', 'uRef1', 'orderId', 'OrderId'),
    ItemsAmount:             pick(o, 'itemsAmount', 'ItemsAmount'),
    DocTotalSy:              pick(o, 'doctotalsy', 'DocTotalSy', 'docTotalSy', 'total'),
    OrderStatusID:           pick(o, 'orderStatusID', 'OrderStatusID'),
    OrderStatusCode:         pick(o, 'orderStatusCode', 'OrderStatusCode', 'statusCode', 'StatusCode'),
    DeliveryDate:            pick(o, 'deliveryDate', 'DeliveryDate'),
    CreatedAt:               pick(o, 'createdate', 'createdAt', 'CreatedAt', 'dateCreated'),
    UpdatedAt:               pick(o, 'updateDate', 'updatedAt', 'UpdatedAt', 'dateModified'),
    Origin:                  pick(o, 'origin', 'Origin'),
    Hostname:                pick(o, 'hostname', 'Hostname'),
    DocEntryOrder:           pick(o, 'DocEntryOrder', 'docEntryOrder'),
    DocEntryInvoice:         pick(o, 'DocEntryInvoice', 'docEntryInvoice'),
    FolioNum:                pick(o, 'folionum', 'FolioNum'),
    IntegrationError:        pick(o, 'integrationError', 'IntegrationError'),
    ShippingEstimate:        pick(o, 'shippingEstimate', 'ShippingEstimate'),
    DeliveryCompany:         pick(o, 'deliveryCompany', 'DeliveryCompany'),
  };
}
function pickOrderFillments(o = {}) {
  return {
    FirstName:        pick(o, 'firstName', 'FirstName'),
    LastName:         pick(o, 'lastName', 'LastName'),
    Email:            pick(o, 'email', 'Email'),
    Phone:            pick(o, 'phone', 'Phone'),
    IsCorporate:      pick(o, 'isCorporate', 'IsCorporate'),
    CurrencyCode:     pick(o, 'currencyCode', 'CurrencyCode'),
    DocumentType:     pick(o, 'documentType', 'DocumentType'),
    Document:         pick(o, 'document', 'Document'),
    AddressType:      pick(o, 'addressType', 'AddressType'),
    ReceiverName:     pick(o, 'receiverName', 'ReceiverName'),
    Street:           pick(o, 'street', 'Street'),
    Number:           pick(o, 'number', 'Number'),
    Neighborhood:     pick(o, 'neighborhood', 'Neighborhood'),
    City:             pick(o, 'city', 'City'),
    State:            pick(o, 'state', 'State'),
    Country:          pick(o, 'country', 'Country'),
    PostalCode:       pick(o, 'postalCode', 'PostalCode'),
    ReferenceAddress: pick(o, 'referenceAddress', 'ReferenceAddress'),
    Notes:            pick(o, 'notes', 'Notes'),
  };
}


// --------- publisher ----------
async function publishOrderEvent({ action, order = {}, userId }) {
  const eventId = uuidv4();
  const occurredAt = nowSCLIso();

  const fields = pickOrderFields(order);

  const key =
    (fields.OrderID != null && String(fields.OrderID)) ||
    ((fields.SalesChannelReferenceId || '') + ':' + (fields.URef1 || '')) ||
    eventId;

  const meta = {
    StatusChanged:  pick(order, 'statusChanged', 'StatusChanged'),
    ItemsInserted:  pick(order, 'itemsInserted', 'ItemsInserted'),
    ItemsUpserted:  pick(order, 'itemsUpserted', 'ItemsUpserted'),
    ReplaceItems:   pick(order, 'replaceItems', 'ReplaceItems'),
  };

  // ---- Items (con límite) ----
  let Items = undefined;
  const rawItems = pick(order, 'items', 'Items');
  if (Array.isArray(rawItems) && rawItems.length) {
    Items = rawItems.slice(0, MAX_ITEMS_IN_PAYLOAD).map(pickItemFields);
  }

  
  let Fulfillment = undefined;
  let Fulfillments = undefined;
  let FulfillmentsCount = undefined;

  const rawFulfillment =
    pick(order, 'fulfillment', 'Fulfillment', 'shippingAddress', 'ShippingAddress');

  if (Array.isArray(rawFulfillment) && rawFulfillment.length) {
    Fulfillments = rawFulfillment.map(pickOrderFillments);
    FulfillmentsCount = rawFulfillment.length;
  } else if (rawFulfillment && typeof rawFulfillment === 'object') {
    Fulfillment = pickOrderFillments(rawFulfillment);
    FulfillmentsCount = 1;
  }

  const payload = {
    eventId,
    action,
    occurredAt,
    ...fields,
    ...meta,
    ...(Items
      ? { Items, ItemsCount: rawItems.length }
      : { ItemsCount: pick(order, 'itemsAmount', 'ItemsAmount') }),
    ...(Fulfillment ? { Fulfillment } : {}),
    ...(Fulfillments ? { Fulfillments, FulfillmentsCount } : {}),
  };

  await sendBatch(TOPIC, [
    {
      key: String(key),
      value: JSON.stringify(payload),
      headers: ensureHeaders({
        action,
        eventId,
        'content-type': 'application/json',
        'occurred-at': occurredAt,
        'user-id': userId ?? '',
      }),
    },
  ]);
}

module.exports = { publishOrderEvent };
