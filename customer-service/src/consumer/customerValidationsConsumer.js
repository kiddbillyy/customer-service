// src/consumer/customerValidationsConsumer.js
import { Kafka, logLevel } from 'kafkajs';
import { customerCreateLoose } from '../utils/validators.js';
import { createCustomer } from '../models/customersModel.js';
import { emitCustomerOk } from '../producer/customerOkProducer.js';
import { upsertBusinessPartner } from '../integrations/sapB1.js';

const BROKERS   = (process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'kafka:9092').split(',');
const CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'customer-service';
const GROUP_ID  = process.env.KAFKA_GROUP_ID_CUSTOMER_VALIDATIONS || `${CLIENT_ID}-customer-validations`;
const TOPIC_IN  = process.env.KAFKA_VALIDATIONS_TOPIC_IN || 'customer.validations';

const kafka = new Kafka({ clientId: CLIENT_ID, brokers: BROKERS, logLevel: logLevel.INFO });
const consumer = kafka.consumer({ groupId: GROUP_ID });

let _consumerConnected = false;
let _running = false;

export function customerValidationsHealth() {
  return { consumerConnected: _consumerConnected, running: _running, groupId: GROUP_ID, topic: TOPIC_IN };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function upsertBPWithRetry(cust, addrs) {
  for (const delay of [0, 300, 1000]) {
    if (delay) await sleep(delay);
    const r = await upsertBusinessPartner(cust, addrs);
    if (r.ok) return r;
  }
  return { ok: false, error: 'SAP_RETRIES_EXHAUSTED' };
}

/** Obtiene el código de canal desde el evento, normalizado a MAYÚSCULAS */
function getSalesChannelCode(evt = {}) {
  const raw =
    evt.SalesChannel ??
    evt.SalesChannelCode ??
    evt.salesChannel ??
    evt.salesChannelCode ??
    evt.SalesChannel?.Code ??
    evt.salesChannel?.code ??
    evt.ChannelCode ??
    evt.channelCode ??
    null;
  return typeof raw === 'string' ? raw.trim().toUpperCase() : null;
}

/** Helpers para payload de error hacia customer.ok */
function toStr(v) {
  const s = typeof v === 'string' ? v : (v?.message || v?.toString?.() || JSON.stringify(v));
  return String(s);
}
function truncate(s, max = 800) {
  const str = toStr(s);
  return str.length > max ? str.slice(0, max) + '…' : str;
}
/** Normaliza errores (incluye Zod, Axios y genéricos) */
function buildError(stage, err, extra = {}) {
  // axios-like
  const axiosData = err?.response?.data;
  const axiosStatus = err?.response?.status;

  // zod-like
  const zodIssues = err?.issues || err?.errors;
  const zodFirst = Array.isArray(zodIssues) && zodIssues.length
    ? `${zodIssues[0]?.path?.join('.') || 'unknown'}: ${zodIssues[0]?.message || 'invalid'}`
    : null;

  const code =
    err?.code ||
    err?.name ||
    (axiosStatus ? `HTTP_${axiosStatus}` : null) ||
    (zodFirst ? 'ZOD_VALIDATION' : null) ||
    'GENERIC_ERROR';

  const message =
    zodFirst ||
    truncate(
      axiosData?.message ||
      axiosData?.error ||
      err?.message ||
      err
    );

  const reason =
    axiosData?.reason || axiosData?.error || axiosData ||
    err?.reason || undefined;

  return {
    stage,                // dónde falló
    code: String(code),
    message: String(message),
    ...(reason ? { reason: truncate(reason) } : {}),
    ...(Object.keys(extra || {}).length ? { extra } : {}),
  };
}

/** Construye un string corto para el campo `error` del customer.ok */
function makeErrorText(errPayload) {
  // Ej: "VALIDATION/ZOD_VALIDATION: field.path: invalid"
  if (!errPayload) return 'UNKNOWN_ERROR';
  const parts = [];
  if (errPayload.stage) parts.push(errPayload.stage);
  if (errPayload.code)  parts.push(errPayload.code);
  const head = parts.length ? parts.join('/') : 'ERROR';
  return `${head}: ${errPayload.message || 'Unknown failure'}`;
}

export async function startCustomerValidationsConsumer() {
  consumer.on(consumer.events.CONNECT,    () => { _consumerConnected = true;  console.log('[Kafka][cust-valid] CONSUMER CONNECT'); });
  consumer.on(consumer.events.DISCONNECT, () => { _consumerConnected = false; _running = false; console.warn('[Kafka][cust-valid] CONSUMER DISCONNECT'); });
  consumer.on(consumer.events.CRASH,      (e) => { _running = false; console.error('[Kafka][cust-valid] CONSUMER CRASH', e?.payload?.error); });

  await consumer.connect();
  _consumerConnected = true;

  await consumer.subscribe({ topic: TOPIC_IN, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      _running = true;
      const rawMsg = message.value?.toString('utf8') ?? '{}';
      try {
        const evt = JSON.parse(rawMsg);
        const channelCode = getSalesChannelCode(evt);
        const f = evt?.Fulfillment || {};

        // Normalización email/teléfono
        const rawEmail = (f.Email ?? '').trim();
        const email = rawEmail.toLowerCase() === 'noreply@noreply.cl' ? '' : rawEmail;
        const rawPhone = (f.Phone ?? '').trim();
        const phone = rawPhone === 'XXXXXXX' ? '' : rawPhone;

        // 1) Normaliza/valida y deriva id
        let payload;
        try {
          payload = customerCreateLoose.parse({
            partnerType: 'C',
            rut: String(f.Document || ''),
            firstName: f.FirstName || '',
            lastName : f.LastName  || '',
            email    : email,
            phone    : phone,
            address  : f.Street ? `${f.Street} ${f.Number ?? ''}`.trim() : null,
            city     : f.City ?? f.Neighborhood ?? null,
            region   : f.State ?? null,
            country  : (f.Country ? String(f.Country).slice(0,3) : 'CL'),
            currency : f.CurrencyCode ?? 'CLP',
          });
        } catch (zerr) {
          const errPayload = buildError('VALIDATION', zerr, { orderId: evt?.OrderID, salesChannel: channelCode });
          const errorText  = makeErrorText(errPayload); // ← string para customer.ok
          if (channelCode !== 'MER-001') {
            await emitCustomerOk({ orderId: evt?.OrderID ?? null, ok: false, cardCode: null, message: errorText });
          } else {
            console.log('[customer-validations] Skip emitCustomerOk (MER-001, validation error)');
          }
          return;
        }

        // 👉 Guardar el origen (SalesChannel) en Customers
        payload.origin = channelCode || null;

        // 2) Persistencia
        let created;
        try {
          created = await createCustomer(payload);
        } catch (dberr) {
          const errPayload = buildError('DB_CREATE_CUSTOMER', dberr, { orderId: evt?.OrderID, salesChannel: channelCode });
          const errorText  = makeErrorText(errPayload);
          if (channelCode !== 'MER-001') {
            await emitCustomerOk({ orderId: evt?.OrderID ?? null, ok: false, cardCode: null, message: errorText });
          } else {
            console.log('[customer-validations] Skip emitCustomerOk (MER-001, db error)');
          }
          return;
        }
        const cardCode = created?.cardCode || created?.Id || payload.id;

        // 3) Dirección para SAP (DEFAULT Bill-To)
        const addr = {
          AddressName: 'Factura',
          AddressType: 'B',
          Street: f.Street ? `${f.Street} ${f.Number ?? ''}`.trim() : null,
          City: f.City ?? f.Neighborhood ?? null,
          Country: (f.Country ? String(f.Country).slice(0,3) : 'CL'),
        };

        // 4) Gate: SAP antes de responder
        const sapRes = await upsertBPWithRetry(created || payload, [addr]);
        if (!sapRes.ok) {
          console.error('[SAP] BP upsert ERROR:', sapRes.message || sapRes.error);
          const errPayload = buildError('SAP_UPSERT_BP', { message: sapRes.message, code: sapRes.error }, { orderId: evt?.OrderID, salesChannel: channelCode });
          const errorText  = makeErrorText(errPayload);
          if (channelCode !== 'MER-001') {
            await emitCustomerOk({ orderId: evt.OrderID, ok: false, cardCode: null, message: errorText });
          } else {
            console.log('[customer-validations] Skip emitCustomerOk (MER-001, SAP error)');
          }
          return;
        }

        // 5) OK → responde al OMS (excepto MER-001)
        if (channelCode !== 'MER-001') {
          await emitCustomerOk({ orderId: evt.OrderID, ok: true, cardCode: cardCode || null });
        } else {
          console.log('[customer-validations] Skip emitCustomerOk (MER-001, success flow)');
        }

      } catch (err) {
        console.error('[customer-validations] error:', err?.message || err);
        try {
          const evt = (() => { try { return JSON.parse(rawMsg); } catch { return {}; } })();
          const channelCode = getSalesChannelCode(evt);
          const errPayload  = buildError('UNCAUGHT', err, { orderId: evt?.OrderID, salesChannel: channelCode });
          const errorText   = makeErrorText(errPayload);
          // En error, también excluimos MER-001
          if (channelCode !== 'MER-001') {
            await emitCustomerOk({ orderId: evt?.OrderID ?? null, ok: false, cardCode: null, message: errorText });
          } else {
            console.log('[customer-validations] Skip emitCustomerOk (MER-001, catch flow)');
          }
        } catch (e2) {
          console.error('[customer-validations] fallback emit error:', e2?.message || e2);
        }
      }
    },
  });

  console.log(`[Kafka] Subscrito a ${TOPIC_IN} (groupId=${GROUP_ID})`);
}

export async function stopCustomerValidationsConsumer() {
  try { await consumer.disconnect(); } catch {}
  _consumerConnected = false;
  _running = false;
}




