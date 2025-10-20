 import { Kafka, Partitioners } from 'kafkajs';
 import { env } from './env.js';

 export const kafka = new Kafka({
   clientId: env.KAFKA_CLIENT_ID,
   brokers: [env.KAFKA_BROKER]
 });

 export const producer = kafka.producer({
   createPartitioner: Partitioners.LegacyPartitioner,
 });

 export const consumerOrders    = kafka.consumer({ groupId: `${env.KAFKA_GROUP_ID}-orders` });
 export const consumerCustomers = kafka.consumer({ groupId: `${env.KAFKA_GROUP_ID}-customers` });
export const consumerPayments  = kafka.consumer({ groupId: `${env.KAFKA_GROUP_ID}-payments` });

 export async function startKafka() {
   await producer.connect();
   await Promise.all([
     consumerOrders.connect(),
     consumerCustomers.connect(),
    consumerPayments.connect(),
   ]);
 }

 export async function disconnectKafka() {
   await Promise.allSettled([
     producer.disconnect(),
     consumerOrders.disconnect(),
     consumerCustomers.disconnect(),
    consumerPayments.disconnect(),
   ]);
 }
