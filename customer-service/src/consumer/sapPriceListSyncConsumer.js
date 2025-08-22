import { Kafka, logLevel } from 'kafkajs';
import { sapPriceListEvent } from '../utils/validators.js';
import { upsertPriceListFromSap } from '../models/masterDataModel.js';

const BROKERS = (process.env.KAFKA_BROKER || 'kafka:9092').split(',');
const CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'id-service';
const GROUP_ID  = process.env.KAFKA_GROUP_ID_SAP_PL || `${CLIENT_ID}-sap-pl-sync`;
const TOPIC     = process.env.KAFKA_TOPIC_SAP_PRICE_LIST_SYNC || 'sap.price-list.sync';
const DLQ       = process.env.KAFKA_TOPIC_SAP_PRICE_LIST_SYNC_DLQ || 'sap.price-list.dlq';

const kafka = new Kafka({ clientId: CLIENT_ID, brokers: BROKERS, logLevel: logLevel.INFO });
const consumer = kafka.consumer({ groupId: GROUP_ID });
const producer = kafka.producer();

export async function startSapPriceListSyncConsumer() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString('utf8') ?? '{}';
      try {
        const payload = JSON.parse(raw);
        // valida (coercea createDate si viene)
        const data = sapPriceListEvent.parse(payload);

        const row = await upsertPriceListFromSap(data);
        console.log(`[SAP PriceList] upsert OK listNum=${row.ListNum} name="${row.ListName}"`);
      } catch (err) {
        console.error('[SAP PriceList] error:', err?.message || err);
        // a DLQ para reproceso/diagnóstico
        try {
          await producer.send({
            topic: DLQ,
            messages: [{
              key: message.key?.toString('utf8'),
              value: raw,
              headers: {
                'x-error': Buffer.from(String(err?.message || 'unknown')),
                'x-origin-topic': Buffer.from(topic)
              }
            }]
          });
        } catch (dlqErr) {
          console.error('[SAP PriceList] error enviando a DLQ:', dlqErr?.message || dlqErr);
        }
      }
    }
  });

  console.log(`[Kafka] Subscrito a ${TOPIC} (groupId=${GROUP_ID})`);
}

export async function stopSapPriceListSyncConsumer() {
  try { await consumer.disconnect(); } catch {}
  try { await producer.disconnect(); } catch {}
}
