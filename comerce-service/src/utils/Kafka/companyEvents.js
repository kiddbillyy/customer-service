// utils/kafka/companyEvents.js  
const { v4: uuidv4 } = require('uuid');
const { sendBatch } = require('../kafkaProducer');
const { nowSCLIso } = require('../dates');

const TOPIC = process.env.KAFKA_TOPIC_COMPANY || 'commerce.company.events';

function ensureHeaders(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v == null ? '' : String(v);
  return out;
}

// Solo los campos solicitados
function pickCompanyFields(c) {
  return {
    ReferenceId: c.ReferenceId,
    LegalName: c.LegalName,
    BusinessName: c.BusinessName,
    Tax: c.Tax,
    PhoneNumber: c.PhoneNumber,
    Status: c.Status,
    CreatedAt: c.CreatedAt,
    UpdatedAt: c.UpdatedAt,
    Email: c.Email,
    DocumentNumber: c.DocumentNumber,
  };
}

async function publishCompanyEvent({ action, company, userId }) {
  const eventId = uuidv4();

  // Payload mínimo: eventId + action + campos solicitados (SIN anidar)
  const payload = {
    eventId,
    action,
    ...pickCompanyFields(company),
  };

  const key = String(company.ReferenceId || company.Id || '');

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

module.exports = { publishCompanyEvent };
