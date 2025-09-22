// src/services/creditService.js
import * as model from '../models/creditsModel.js';
import * as txModel from '../models/transactionsModel.js';

// Utilidades
import { z } from 'zod';
import { getPool, sql } from '../config/db.js';
import { logger } from '../utils/logger.js';

// -------------------------
// API pública (como la tenías)
// -------------------------
export async function upsert(payload) { return model.upsertCredit(payload); }
export async function list(filters) { return model.listCredits(filters); }
export async function get(id) { return model.getById(id); }
export async function patch(id, patch) { return model.patchCredit(id, patch); }
export async function recalculate(id) { return model.recalculate(id); }

export async function listTransactions(creditId) { return txModel.listByCredit(creditId); }
export async function createTransaction(creditId, tx) { return txModel.createTx(creditId, tx); }

// -------------------------
// Normalizadores y helpers
// -------------------------
function coalesce(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

// Si customer.id no es UUID, úsalo como CardCode (heurística)
function maybeCardCodeFromCustomerId(s) {
  if (!s || typeof s !== 'string') return undefined;
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4.test(s) ? undefined : s;
}

// -------------------------
// Esquema Zod (sobre el objeto ya normalizado)
// -------------------------
const creditUpsertSchema = z.object({
  customerId: z.string().uuid().optional(),
  cardCode: z.string().min(1).optional(),

  // 👇 si llega null => se convierte en undefined (no pisa)
  creditLimit: z.preprocess(
    (v) => (v === null ? undefined : v),
    z.number().nonnegative().optional()
  ),

  paymentTermCode: z.string().optional(),
  riskLevel: z.number().int().min(0).max(2).optional(),
  isBlocked: z.boolean().optional(),
  notes: z.string().max(500).optional()
}).refine(d => d.customerId || d.cardCode, {
  message: 'Debe indicar customerId o cardCode'
});

// -------------------------
// Auditoría vía SP dbo.sp_LogCreditEvent
// -------------------------
async function logAudit({ creditId, event, detail }) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('creditId', sql.UniqueIdentifier, creditId ?? null)
      .input('event', sql.NVarChar(50), event)
      .input('detail', sql.NVarChar(sql.MAX), detail ?? null)
      .execute('dbo.sp_LogCreditEvent');
  } catch (err) {
    logger?.warn?.({ err }, 'Fallo registrando auditoría en sp_LogCreditEvent');
  }
}

// -------------------------
// Handler: customer.credit.upsert (tolerante)
// -------------------------
export async function handleCustomerCreditUpsert(evtRaw) {
  // Log del evento crudo
  console.log('[EVENT RECEIVED] customer.credit.upsert:', JSON.stringify(evtRaw, null, 2));

  // 1) Normalizar desde varias formas posibles del productor
  const normalized = {
    // IDs
    customerId: coalesce(
      evtRaw.customerId,
      evtRaw.customer?.uuid // si en el futuro envías uuid
      // (no inferimos uuid desde customer.id)
    ),
    cardCode: coalesce(
      evtRaw.cardCode,
      evtRaw.customer?.cardCode,
      maybeCardCodeFromCustomerId(evtRaw.customer?.id) // p.ej. "22615936C"
    ),

    // Límites y campos
    creditLimit: coalesce(
      evtRaw.creditLimit,
      evtRaw.credit?.limit !== null ? evtRaw.credit?.limit : undefined // ignora null
    ),
    paymentTermCode: coalesce(
      evtRaw.paymentTermCode,
      evtRaw.customer?.paymentTermCode
    ),
    riskLevel: coalesce(evtRaw.riskLevel),
    isBlocked: coalesce(evtRaw.isBlocked),
    notes: coalesce(evtRaw.notes, evtRaw.credit?.notes),
  };

  // 2) Validar el objeto ya normalizado (no crashea por estructura distinta)
  let payload;
  try {
    payload = creditUpsertSchema.parse(normalized);
  } catch (err) {
    // Si falta customerId/cardCode, no crashear el consumer
    logger.warn({
      err,
      eventId: evtRaw.eventId,
      producer: evtRaw.producer
    }, '[WARN] credit.upsert ignorado por falta de customerId/cardCode');
    return;
  }

  // 3) Construir el upsert evitando pisar con undefined
  const upsertPayload = {
    customerId: payload.customerId,
    cardCode: payload.cardCode,
    ...(payload.creditLimit !== undefined ? { creditLimit: payload.creditLimit } : {}),
    ...(payload.paymentTermCode ? { paymentTermCode: payload.paymentTermCode } : {}),
    ...(payload.riskLevel !== undefined ? { riskLevel: payload.riskLevel } : {}),
    ...(payload.isBlocked !== undefined ? { isBlocked: payload.isBlocked } : {}),
    ...(payload.notes ? { notes: payload.notes } : {}),
  };

  // 4) Upsert
  const updated = await upsert(upsertPayload);

  // 5) Auditoría (no romper si falla)
  await logAudit({
    creditId: updated?.id ?? null,
    event: 'credit.upsert',
    detail: JSON.stringify(evtRaw)
  });

  console.log('[EVENT PROCESSED] credit.upsert -> creditId:', updated?.id);
  return updated;
}
