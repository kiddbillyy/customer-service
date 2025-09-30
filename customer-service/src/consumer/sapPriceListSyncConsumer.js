import { Kafka, logLevel } from 'kafkajs';
import { sapPriceListEvent } from '../utils/validators.js';
import { upsertPriceListFromSap } from '../models/masterDataModel.js';

const BROKERS  = (process.env.KAFKA_BROKER || 'kafka:9092').split(',');
const CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'id-service';
const GROUP_ID  = process.env.KAFKA_GROUP_ID_SAP_PL || `${CLIENT_ID}-sap-pl-sync`;
const TOPIC     = process.env.KAFKA_TOPIC_SAP_PRICE_LIST_SYNC || 'sap.price-list.sync';
const DLQ       = process.env.KAFKA_TOPIC_SAP_PRICE_LIST_SYNC_DLQ || 'sap.price-list.dlq';

const kafka = new Kafka({ clientId: CLIENT_ID, brokers: BROKERS, logLevel: logLevel.INFO });
const consumer = kafka.consumer({ groupId: GROUP_ID });
const producer = kafka.producer({ allowAutoTopicCreation: true });

// ---- Health flags ----
let _consumerConnected = false;
let _producerConnected = false;
let _running = false;

export function sapPriceListSyncHealth() {
  return {
    consumerConnected: _consumerConnected,
    producerConnected: _producerConnected,
    running: _running,
    groupId: GROUP_ID,
    topic: TOPIC,
    dlq: DLQ,
  };
}

export async function startSapPriceListSyncConsumer() {
  // listeners para mantener health actualizado
  consumer.on(consumer.events.CONNECT,    () => { _consumerConnected = true;  console.log('[Kafka][sap-pl] CONSUMER CONNECT'); });
  consumer.on(consumer.events.DISCONNECT, () => { _consumerConnected = false; _running = false; console.warn('[Kafka][sap-pl] CONSUMER DISCONNECT'); });
  consumer.on(consumer.events.CRASH,      (e) => { _running = false; console.error('[Kafka][sap-pl] CONSUMER CRASH', e?.payload?.error); });

  producer.on(producer.events.CONNECT,    () => { _producerConnected = true;  console.log('[Kafka][sap-pl] PRODUCER CONNECT'); });
  producer.on(producer.events.DISCONNECT, () => { _producerConnected = false; console.warn('[Kafka][sap-pl] PRODUCER DISCONNECT'); });

  await producer.connect();
  _producerConnected = true;

  await consumer.connect();
  _consumerConnected = true;

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      _running = true;
      const raw = message.value?.toString('utf8') ?? '{}';
      try {
        const payload = JSON.parse(raw);
        const data = sapPriceListEvent.parse(payload); // valida/coercea
        const row = await upsertPriceListFromSap(data);
        console.log(`[SAP PriceList] upsert OK listNum=${row.ListNum} name="${row.ListName}"`);
      } catch (err) {
        console.error('[SAP PriceList] error:', err?.message || err);
        // Enviar a DLQ para reprocesar/diagnosticar
        try {
          await producer.send({
            topic: DLQ,
            messages: [{
              key: message.key?.toString('utf8'),
              value: raw,
              headers: {
                'x-error': Buffer.from(String(err?.message || 'unknown')),
                'x-origin-topic': Buffer.from(topic),
                'x-partition': Buffer.from(String(partition)),
              },
            }],
          });
        } catch (dlqErr) {
          console.error('[SAP PriceList] error enviando a DLQ:', dlqErr?.message || dlqErr);
        }
      }
    },
  });

  console.log(`[Kafka] Subscrito a ${TOPIC} (groupId=${GROUP_ID})`);
}

export async function stopSapPriceListSyncConsumer() {
  try { await consumer.disconnect(); } catch {}
  try { await producer.disconnect(); } catch {}
  _consumerConnected = false;
  _producerConnected = false;
  _running = false;
}
