import { z } from 'zod';

export const creditUpsertSchema = z.object({
  customerId: z.string().uuid().optional(),
  cardCode: z.string().min(1).optional(),
  creditLimit: z.number().nonnegative(),
  paymentTermCode: z.string().optional(),
  riskLevel: z.number().int().min(0).max(2).optional(),
  isBlocked: z.boolean().optional(),
  notes: z.string().max(500).optional()
}).refine(d => d.customerId || d.cardCode, { message: 'Debe indicar customerId o cardCode' });

export const transactionSchema = z.object({
  type: z.enum(['charge','payment','adjustment']),
  direction: z.enum(['debit','credit']),
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default('CLP'),
  reference: z.string().optional(),
  sourceSystem: z.string().optional(),
  meta: z.any().optional()
});

export const holdSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).default('CLP'),
  orderId: z.string().optional(),
  //expiresAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().optional()
});
