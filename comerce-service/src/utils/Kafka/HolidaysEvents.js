// utils/kafka/holidayEvents.js  
const { v4: uuidv4 } = require('uuid');
const { sendBatch } = require('../kafkaProducer');
const { nowSCLIso } = require('../dates');

const TOPIC = process.env.KAFKA_TOPIC_HOLIDAY || 'commerce.holiday.events';

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

// Solo los campos solicitados
function pickHolidaysFields(h = {}) {
  return {
    ReferenceId: pick(h, 'ReferenceId', 'referenceId', 'Id', 'id'),
    Name:        pick(h, 'Name', 'name'),
    Day:         pick(h, 'Day', 'day'),
    Status:      pick(h, 'Status', 'status'),
    Description: pick(h, 'Description', 'description'),
    Target:      pick(h, 'Target', 'target'),
    Scope:       pick(h, 'Scope', 'scope'),
    CreatedAt:   pick(h, 'CreatedAt', 'createdAt', 'dateCreated'),
    UpdatedAt:   pick(h, 'UpdatedAt', 'updatedAt', 'dateModified'),
  };
}

async function publishholidayEvent({ action, holiday, userId }) {
  const eventId = uuidv4();

  const occurredAt = nowSCLIso();

  const fields = pickHolidaysFields(holiday);
  const key = String(pick(holiday, 'Id', 'id') ?? ''); // asegura key

  // Payload mínimo: eventId + action + campos solicitados (SIN anidar)
  const payload = {
    eventId,
    action,
    occurredAt,
    ...fields,
  };


  await sendBatch(TOPIC, [
    {
      key,
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

module.exports = { publishholidayEvent };
