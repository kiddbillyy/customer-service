// ESM
import { Kafka, logLevel } from "kafkajs";

const BROKERS = (process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || "kafka:9092")
  .split(",")
  .map(s => s.trim());

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "customer-service",
  brokers: BROKERS,
  logLevel: logLevel.WARN,
});

const producer = kafka.producer();

export async function initKafkaProducer() {
  await producer.connect();
  console.log("[Kafka] Producer conectado");
}

export async function sendCustomerCreditUpsert({ key, value }) {
  const topic = process.env.KAFKA_TOPIC_CUSTOMER_CREDIT_UPSERT || "customer.credit.upsert";
  await producer.send({
    topic,
    messages: [{ key, value: JSON.stringify(value) }],
  });
   console.log(`[Kafka] Enviado a ${topic} key=${key}`); // 👈 log explícito
}

export async function stopKafkaProducer() {
  try { await producer.disconnect(); } catch {}
}
