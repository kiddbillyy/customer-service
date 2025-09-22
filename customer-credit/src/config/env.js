import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(5012),
  API_KEY: z.string().min(4),

  SQL_SERVER_HOST: z.string(),
  SQL_SERVER_PORT: z.coerce.number().default(1433),
  SQL_SERVER_USER: z.string(),
  SQL_SERVER_PASS: z.string(),
  SQL_SERVER_DB: z.string(),
  SQL_ENCRYPT: z
    .union([z.literal('true'), z.literal('false')])
    .transform(v => v === 'true')
    .default('false'),

  KAFKA_BROKER: z.string(),
  KAFKA_CLIENT_ID: z.string().default('customer-credit'),
  KAFKA_GROUP_ID: z.string().default('customer-credit-consumer'),

  TOPIC_CUSTOMER_CREATED: z.string().default('customer.created'),
  TOPIC_CUSTOMER_UPDATED: z.string().default('customer.updated'),
  TOPIC_ORDER_AUTHORIZED: z.string().default('order.authorized'),
  TOPIC_ORDER_CANCELLED: z.string().default('order.cancelled'),
  TOPIC_ORDER_INVOICED: z.string().default('order.invoiced'),
  TOPIC_PAYMENT_APPLIED: z.string().default('payment.applied'),

  TOPIC_CREDIT_UPDATED: z.string().default('credit.updated'),
  TOPIC_CREDIT_HOLD_PLACED: z.string().default('credit.hold.placed'),
  TOPIC_CREDIT_HOLD_RELEASED: z.string().default('credit.hold.released'),
  TOPIC_CREDIT_HOLD_CONSUMED: z.string().default('credit.hold.consumed'),
  TOPIC_CREDIT_DECLINED: z.string().default('credit.declined'),
  TOPIC_CREDIT_TX_RECORDED: z.string().default('credit.transaction.recorded'),

 KAFKA_TOPIC_CUSTOMER_CREDIT_UPSERT: z.string().default('customer.credit.upsert'),

});

export const env = schema.parse(process.env);
