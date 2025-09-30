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

// allowAutoTopicCreation ayuda en dev; en prod usualmente se desactiva
const producer = kafka.producer({ allowAutoTopicCreation: true });

let _connected = false;
let _connecting = null; // evita carreras de connect()

/** Backoff exponencial con jitter */
async function retry(fn, { retries = 3, baseMs = 300, factor = 2 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const jitter = Math.floor(Math.random() * 100);
      const delay = baseMs * Math.pow(factor, attempt - 1) + jitter;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function ensureConnected() {
  if (_connected) return;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    try {
      await producer.connect();
      _connected = true;
      console.log("[Kafka] Producer conectado");
    } finally {
      _connecting = null;
    }
  })();

  return _connecting;
}

export async function initKafkaProducer() {
  // Conecta al arrancar y deja un “readyPromise” implícito
  await ensureConnected();
}

export async function sendCustomerCreditUpsert({ key, value, headers } = {}) {
  const topic = process.env.KAFKA_TOPIC_CUSTOMER_CREDIT_UPSERT || "customer.credit.upsert";
  await ensureConnected();

  const payload = {
    topic,
    messages: [{
      key: String(key ?? ''),
      value: typeof value === "string" ? value : JSON.stringify(value, (_k, v) => {
        if (typeof v === 'object' && v !== null && (v.socket || v.parser || v.req || v.res)) return '[omitted]';
        return v;
      }),
      headers: headers ?? undefined
    }]
  };

  await retry(() => producer.send(payload), { retries: 4, baseMs: 250, factor: 2 });
  console.log(`[Kafka] Enviado a ${topic} key=${key}`);
}

export function kafkaHealth() {
  return { connected: _connected, brokers: BROKERS.length };
}

export async function stopKafkaProducer() {
  try {
    await producer.disconnect();
  } catch {}
  _connected = false;
}

// Opcional: listeners para mantener el flag actualizado y loguear
producer.on(producer.events.CONNECT, () => {
  _connected = true;
  console.log("[Kafka] CONNECT");
});
producer.on(producer.events.DISCONNECT, () => {
  _connected = false;
  console.warn("[Kafka] DISCONNECT");
});
producer.on(producer.events.REQUEST_TIMEOUT, e => {
  console.warn("[Kafka] REQUEST_TIMEOUT", e?.payload?.apiName);
});
