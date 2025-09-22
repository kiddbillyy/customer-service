import { consumer } from '../config/kafka.js';
import { env } from '../config/env.js';
import * as creditService from '../services/creditService.js'; // 👈 lo habilitamos

export async function runCustomerConsumer() {
  await consumer.subscribe({ topic: env.TOPIC_CUSTOMER_CREATED, fromBeginning: false });
  await consumer.subscribe({ topic: env.TOPIC_CUSTOMER_UPDATED, fromBeginning: false });
  await consumer.subscribe({ topic: env.KAFKA_TOPIC_CUSTOMER_CREDIT_UPSERT, fromBeginning: false }); // 👈 nuevo

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const evt = JSON.parse(message.value.toString());

      if (topic === env.TOPIC_CUSTOMER_CREATED) {
        // baseline de crédito
        await creditService.handleCustomerCreated(evt);
      }

      if (topic === env.TOPIC_CUSTOMER_UPDATED) {
        // sync de términos de pago u otros datos
        await creditService.handleCustomerUpdated(evt);
      }

      if (topic === env.KAFKA_TOPIC_CUSTOMER_CREDIT_UPSERT) {
        // 👇 upsert directo desde evento
        await creditService.handleCustomerCreditUpsert(evt);
      }
    }
  });
}
