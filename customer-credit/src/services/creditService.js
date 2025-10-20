// src/services/creditService.js
import * as model from '../models/creditsModel.js';
import * as txModel from '../models/transactionsModel.js';

// Utilidades
import { z } from 'zod';
import { getPool, sql } from '../config/db.js';
import { logger } from '../utils/logger.js';

// -------------------------
// API pública
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

function toBool(v) {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.trim() !== '' && v !== '0' && v.toLowerCase() !== 'false';
  return undefined;
}

// Si customer.id no es UUID, úsalo como CardCode (heurística)
function maybeCardCodeFromCustomerId(s) {
  if (!s || typeof s !== 'string') return undefined;
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4.test(s) ? undefined : s;
}

// GUID simple check (no estricto de versión)
function isGuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Busca el GUID del crédito por cardCode/customerId
async function findCreditId({ cardCode, customerId }) {
  const pool = await getPool();
  const rq = pool.request()
    .input('cardCode',   sql.NVarChar(50), cardCode ?? null)
    .input('customerId', sql.NVarChar(50), customerId ?? null);

  const rs = await rq.query(`
SELECT TOP 1 id
FROM dbo.CustomerCredits
WHERE (@cardCode IS NOT NULL AND cardCode = @cardCode)
   OR (@customerId IS NOT NULL AND customerId = @customerId)
ORDER BY updatedAt DESC;
`);
  return rs.recordset?.[0]?.id ?? null;
}

// -------------------------
// Esquemas Zod
// -------------------------
const creditUpsertSchema = z.object({
  customerId: z.string().uuid().optional(),
  cardCode: z.string().min(1).optional(),

  // Acepta number o string numérica; null => undefined (no pisa)
  creditLimit: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : Number(v)),
    z.number().nonnegative().optional()
  ),

  paymentTermCode: z.string().optional(),
  riskLevel: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(0).max(2).optional()   // ajusta el max si usas más niveles
  ),
  isBlocked: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : toBool(v)),
    z.boolean().optional()
  ),
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
  // 1) Envelope estándar del Outbox { event, version, ts, traceId, payload: {...} }
  const src = evtRaw?.payload && typeof evtRaw.payload === 'object'
    ? evtRaw.payload
    : evtRaw; // retrocompatibilidad con productores antiguos

  // 2) Normalizar desde múltiples formas posibles
  const normalized = {
    // IDs
    customerId: coalesce(
      src.customerId,
      evtRaw.customerId,
      evtRaw.customer?.uuid // por si algún productor antiguo lo envía así
    ),
    cardCode: coalesce(
      src.cardCode,
      evtRaw.cardCode,
      evtRaw.customer?.cardCode,
      maybeCardCodeFromCustomerId(evtRaw.customer?.id) // heurística si te mandan el id string
    ),

    // Campos de crédito
    creditLimit: coalesce(
      src.creditLimit,
      evtRaw.creditLimit,
      evtRaw.credit?.limit !== null ? evtRaw.credit?.limit : undefined
    ),
    paymentTermCode: coalesce(
      src.paymentTermCode,
      evtRaw.paymentTermCode,
      evtRaw.customer?.paymentTermCode
    ),
    riskLevel: coalesce(src.riskLevel, evtRaw.riskLevel),
    isBlocked: coalesce(
      src.isBlocked,
      typeof evtRaw.isBlocked !== 'undefined' ? evtRaw.isBlocked : undefined
    ),
    notes: coalesce(src.notes, evtRaw.notes, evtRaw.credit?.notes),
  };

  // 3) Validar objeto ya normalizado (tolerante a formatos distintos)
  let payload;
  try {
    payload = creditUpsertSchema.parse(normalized);
  } catch (err) {
    logger.warn({ err, eventId: evtRaw.eventId, producer: evtRaw.producer },
      '[WARN] credit.upsert ignorado por validación (falta customerId/cardCode o datos inválidos)');
    return;
  }

  // 4) Construir upsert evitando pisar con undefined
  const upsertPayload = {
    customerId: payload.customerId,
    cardCode: payload.cardCode,
    ...(payload.creditLimit !== undefined ? { creditLimit: payload.creditLimit } : {}),
    ...(payload.paymentTermCode ? { paymentTermCode: payload.paymentTermCode } : {}),
    ...(payload.riskLevel !== undefined ? { riskLevel: payload.riskLevel } : {}),
    ...(payload.isBlocked !== undefined ? { isBlocked: payload.isBlocked } : {}),
    ...(payload.notes ? { notes: payload.notes } : {}),
  };

  // 5) Upsert a través de tu modelo
  const updated = await upsert(upsertPayload);

  // 6) Auditoría (no romper si falla)
  await logAudit({
    creditId: updated?.id ?? null,
    event: 'credit.upsert',
    detail: JSON.stringify(evtRaw)
  });

  logger.info({ creditId: updated?.id }, '[EVENT PROCESSED] credit.upsert');
  return updated;
}

// -------------------------
// Handler: payment.received / payment.applied
// -------------------------
const paymentSchema = z.object({
  paymentId: z.string().min(1),
  // priorizamos cardCode; customerId queda como respaldo
  cardCode: z.string().min(1).optional(),
  customerId: z.string().uuid().optional(),
  amount: z.preprocess((v) => Number(v), z.number().positive()),
  currency: z.string().length(3).default('CLP'),
  // acepta "2025-09-30T17:36:41.6761864" (sin zona) y la transforma a ISO UTC
  appliedAt: z.preprocess((v) => {
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }, z.string().optional()),
});

export async function handlePaymentReceived(evtRaw) {
  // Envelope estándar: { event, version, ts, traceId, payload }
  const src = evtRaw?.payload && typeof evtRaw.payload === 'object' ? evtRaw.payload : evtRaw;

  // Derivar paymentId robusto (SAP: idempotencyKey o source-objType-docEntry)
  const derivedPaymentId =
    src.paymentId ??
    evtRaw.paymentId ??
    evtRaw.idempotencyKey ??
    (evtRaw.source && evtRaw.objType != null && evtRaw.docEntry != null
      ? `${evtRaw.source}-${evtRaw.objType}-${evtRaw.docEntry}`
      : undefined);

  // Derivar amount: amount, amountTotal o suma amounts{cash,check,transfer,creditCard}
  const amountsSum = evtRaw.amounts
    ? Object.values(evtRaw.amounts).reduce((acc, n) => acc + Number(n ?? 0), 0)
    : undefined;
  const derivedAmount = coalesce(src.amount, evtRaw.amount, evtRaw.amountTotal, amountsSum);

  // Derivar cardCode/customerId
  const derivedCardCode = coalesce(
    src.cardCode,
    evtRaw.cardCode,
    evtRaw.customer?.code,            // SAP B1
    evtRaw.customer?.cardCode,
    maybeCardCodeFromCustomerId(evtRaw.customer?.id)
  );
  const derivedCustomerId = coalesce(src.customerId, evtRaw.customerId, evtRaw.customer?.uuid);

  // Derivar currency y appliedAt
  const derivedCurrency  = coalesce(src.currency, evtRaw.currency, 'CLP');
  const derivedAppliedAt = coalesce(src.appliedAt, evtRaw.appliedAt, evtRaw.emittedAt, evtRaw.docDate);

  // Validar con Zod (appliedAt → ISO dentro del schema)
  const candidate = {
    paymentId: derivedPaymentId,
    cardCode: derivedCardCode,
    customerId: derivedCustomerId,
    amount: derivedAmount,
    currency: derivedCurrency,
    appliedAt: derivedAppliedAt,
  };

  let payload;
  try {
    payload = paymentSchema.parse(candidate);
  } catch (err) {
    logger.warn({ err, raw: evtRaw }, '[WARN] payment.* ignorado por validación');
    return;
  }

  // 1) Buscar GUID del crédito directamente en BD
  const creditId = await findCreditId({ cardCode: payload.cardCode, customerId: payload.customerId });
  if (!creditId) throw new Error('Crédito no existe para el cliente');
  if (!isGuid(creditId)) {
    logger.error({ creditId }, 'CreditId no es UNIQUEIDENTIFIER');
    throw new Error('Schema mismatch: creditId debe ser UNIQUEIDENTIFIER');
  }

  // 2) Registrar transacción de pago (direction: credit / abono)
  const occurredAt = payload.appliedAt ?? new Date().toISOString();
  const tx = await txModel.createTx(creditId, {
    type: 'payment',
    direction: 'credit',
    amount: Number(payload.amount),
    currency: payload.currency,
    occurredAt,
    reference: payload.paymentId,                // idempotencia funcional (recomendado UNIQUE en DB)
    sourceSystem: String(evtRaw.source ?? 'PAYMENTS'),
    meta: JSON.stringify({ topic: evtRaw.topic, objType: evtRaw.objType, docEntry: evtRaw.docEntry, docNum: evtRaw.docNum })
  });

  // 3) Recalcular saldos
  await model.recalculate(creditId);

  // 4) Auditoría (no romper si falla)
  await logAudit({
    creditId,
    event: 'payment.received',
    detail: JSON.stringify(evtRaw)
  });

  logger.info({ creditId, transactionId: tx?.id, paymentId: payload.paymentId }, '[EVENT PROCESSED] payment received/applied');
  return { creditId, transactionId: tx?.id };
}
