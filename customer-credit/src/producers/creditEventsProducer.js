import { producer } from '../config/kafka.js';
import { env } from '../config/env.js';

export async function emitCreditUpdated(payload){
  await producer.send({ topic: env.TOPIC_CREDIT_UPDATED, messages: [{ value: JSON.stringify(payload) }] });
}
