// utils/kafka/salesChannelEvents.js
const { v4: uuidv4 } = require('uuid');
const { sendBatch } = require('../kafkaProducer');
const { nowSCLIso } = require('../dates');

const TOPIC = process.env.KAFKA_TOPIC_SALESCHANNEL || 'commerce.saleschannel.events';

function ensureHeaders(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v == null ? '' : String(v);
  return out;
}

function pickSalesChannelFields(sc) {
  return {
    ReferenceId: sc.ReferenceId,
    CompanyId: sc.CompanyId,
    Name: sc.Name,
    ExternalDelivery: sc.ExternalDelivery,
    IsActive: sc.IsActive,
    CreatedAt: sc.CreatedAt,
    UpdatedAt: sc.UpdatedAt,
  };
}

async function publishSalesChannelEvent({ action, salesChannel, userId }) {
  const eventId = uuidv4();

  const payload = {
    eventId,
    action, // "saleschannel.created" | "saleschannel.updated"
    ...pickSalesChannelFields(salesChannel),
  };

  const key = String(salesChannel.ReferenceId || salesChannel.Id || '');

  await sendBatch(TOPIC, [
    {
      key,
      value: JSON.stringify(payload),
      headers: ensureHeaders({
        action,
        eventId,
        'content-type': 'application/json',
        'occurred-at': nowSCLIso(),
        'user-id': userId ?? '',
      }),
    },
  ]);
}

module.exports = { publishSalesChannelEvent };
