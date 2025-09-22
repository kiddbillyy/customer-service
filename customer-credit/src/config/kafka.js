import { Kafka } from 'kafkajs';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const kafka = new Kafka({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: [env.KAFKA_BROKER]
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: env.KAFKA_GROUP_ID });

export async function startKafka() {
  await producer.connect();
  await consumer.connect();
  logger.info('Kafka conectado');
}
