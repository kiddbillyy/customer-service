// src/consumer/customerValidationsConsumer.js
import { Kafka, logLevel } from 'kafkajs';
import { customerCreateLoose } from '../utils/validators.js';
import { createCustomer } from '../models/customersModel.js';
import { emitCustomerOk } from '../producer/customerOkProducer.js';

// Lee ambos nombres por compatibilidad: KAFKA_BROKERS o KAFKA_BROKER
const BROKERS   = (process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'kafka:9092').split(',');
const CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'customer-service';
const GROUP_ID  = process.env.KAFKA_GROUP_ID_CUSTOMER_VALIDATIONS || `${CLIENT_ID}-customer-validations`;
const TOPIC_IN  = process.env.KAFKA_VALIDATIONS_TOPIC_IN || 'customer.validations';

const kafka = new Kafka({ clientId: CLIENT_ID, brokers: BROKERS, logLevel: logLevel.INFO });
const consumer = kafka.consumer({ groupId: GROUP_ID });

// ---- Health flags ----
let _consumerConnected = false;
let _running = false;

export function customerValidationsHealth() {
  return {
    consumerConnected: _consumerConnected,
    running: _running,
    groupId: GROUP_ID,
    topic: TOPIC_IN
  };
}

export async function startCustomerValidationsConsumer() {
  // listeners para health
  consumer.on(consumer.events.CONNECT,    () => { _consumerConnected = true;  console.log('[Kafka][cust-valid] CONSUMER CONNECT'); });
  consumer.on(consumer.events.DISCONNECT, () => { _consumerConnected = false; _running = false; console.warn('[Kafka][cust-valid] CONSUMER DISCONNECT'); });
  consumer.on(consumer.events.CRASH,      (e) => { _running = false; console.error('[Kafka][cust-valid] CONSUMER CRASH', e?.payload?.error); });

  await consumer.connect();
  _consumerConnected = true;

  await consumer.subscribe({ topic: TOPIC_IN, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      _running = true;
      const raw = message.value?.toString('utf8') ?? '{}';
      try {
        const evt = JSON.parse(raw);
        const f = evt?.Fulfillment || {};

        // Construir payload y validarlo/normalizarlo con tu Zod
        const rawPayload = {
          partnerType: f.IsCorporate ? 'P' : 'C',
          rut: String(f.Document || ''), // Zod normaliza y valida DV
          firstName: f.FirstName || '',
          lastName : f.LastName  || '',
          email    : f.Email     || '',
          phone    : f.Phone     ?? null,
          address  : f.Street ? `${f.Street} ${f.Number ?? ''}`.trim() : null,
          city     : f.Neighborhood ?? null,
          region   : f.State        ?? null,
          country  : (f.Country ? String(f.Country).slice(0,3) : 'CL'),
          currency : f.CurrencyCode ?? 'CLP',
        };

        const payload = customerCreateLoose.parse(rawPayload); // deriva id y normaliza rut
        const created = await createCustomer(payload);

        const cardCode = created?.cardCode || created?.Id || payload.id;
        await emitCustomerOk({
          orderId: evt.OrderID,
          ok: !!cardCode,
          cardCode: cardCode || null
        });
      } catch (err) {
        console.error('[customer-validations] error:', err?.message || err);
        // Fallback: responde ok:"false"
        try {
          const evt = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
          await emitCustomerOk({ orderId: evt?.OrderID ?? null, ok: false, cardCode: null });
        } catch (e2) {
          console.error('[customer-validations] error al emitir fallback:', e2?.message || e2);
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
