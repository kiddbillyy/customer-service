// src/services/customerCreditService.js
import { randomUUID } from 'crypto';
import { sendCustomerCreditUpsert } from '../producer/producer.js';
import { buildCustomerCreditUpsertEvent } from '../utils/validators.js';

// Regla: -1 = contado; >= 0 = crédito
function isCreditTerms(groupNum) {
  return typeof groupNum === 'number' && groupNum >= 0;
}

function traceFromReq(req) {
  // ⚠️ Solo campos planos; nada pesado
  return {
    source: req?.originalUrl ?? 'unknown',
    method: req?.method ?? 'GET',
    requestId: req?.id ?? null,
    ip: req?.ip ?? null,
    ua: req?.headers?.['user-agent'] ?? null,
  };
}

/**
 * Evento en creación: emite customer.credit.upsert SOLO si el cliente tiene términos de crédito.
 * (se usa en POST /customers)
 */
export async function upsertCustomerCreditIfNeeded({ created, payload, req }) {
  try {
    const groupNum = created?.GroupNum ?? created?.groupNum ?? payload?.groupNum ?? null;
    if (!isCreditTerms(groupNum)) return;

    const Id          = created?.Id ?? created?.id ?? null;
    const RUT         = created?.RUT ?? created?.rut ?? payload?.rut ?? null;
    const PartnerType = String(created?.PartnerType ?? created?.partnerType ?? '').toUpperCase() || null;
    const GroupCode   = created?.GroupCode ?? created?.groupCode ?? null;
    const ListNum     = created?.ListNum ?? created?.listNum ?? null;
    const Currency    = created?.Currency ?? created?.currency ?? 'CLP';
    const Email       = created?.Email ?? created?.email ?? null;
    const name        = [created?.FirstName ?? created?.firstName, created?.LastName ?? created?.lastName]
                         .filter(Boolean).join(' ') || Id || RUT;

    if (!Id && !RUT) return console.warn('[credit][skip] sin Id ni RUT; no se emite evento');
    if (RUT == null)  return console.warn('[credit][skip] sin RUT; no se emite evento');
    if (!PartnerType) return console.warn('[credit][skip] sin partnerType; no se emite evento');

    const eventPayload = buildCustomerCreditUpsertEvent({
      uuid: randomUUID(),
      nowISO: new Date().toISOString(),
      customer: {
        id: Id, rut: RUT, partnerType: PartnerType,
        groupNum, groupCode: GroupCode, listNum: ListNum,
        currency: Currency, email: Email, name,
      },
      credit: {
        limit: created?.CreditLimit ?? null,
        graceDays: 0,
        maxDaysPastDue: 30,
        notes: 'Alta automática por términos de pago crédito',
      },
      trace: traceFromReq(req),
    });

    await sendCustomerCreditUpsert({
      key: String(Id ?? RUT ?? 'unknown'),
      value: eventPayload, // el producer hará JSON.stringify
    });

    console.log('[customer.credit.upsert] emitido (POST) para', Id ?? RUT, 'groupNum=', groupNum);
  } catch (e) {
    console.error('⚠️ customer.credit.upsert (POST) no enviado:', e?.message || e);
  }
}

/**
 * Evento en PATCH: emite customer.credit.upsert cuando se modifica creditLimit
 * (se llama desde PATCH /customers/:id si el payload incluye creditLimit)
 */
export async function emitCustomerCreditUpsertOnPatch({ id, updated, payload, req }) {
  try {
    // Usa el groupNum final (BD > payload)
    const groupNum = (updated?.GroupNum ?? updated?.groupNum ?? payload?.groupNum ?? null);
    if (!isCreditTerms(groupNum)) {
      console.log('[customer.credit.upsert] skip PATCH: groupNum no es crédito (', groupNum, ')');
      return;
    }

    const Id          = updated?.Id ?? id;
    const RUT         = updated?.RUT ?? payload?.rut ?? null;
    const PartnerType = String(updated?.PartnerType ?? payload?.partnerType ?? 'C').toUpperCase();
    const GroupCode   = updated?.GroupCode ?? payload?.groupCode ?? null;
    const ListNum     = updated?.ListNum ?? payload?.listNum ?? null;
    const Currency    = updated?.Currency ?? payload?.currency ?? 'CLP';
    const Email       = updated?.Email ?? payload?.email ?? null;
    const name        = [updated?.FirstName ?? payload?.firstName, updated?.LastName ?? payload?.lastName]
                         .filter(Boolean).join(' ') || Id || RUT;

    if (!Id && !RUT) return console.warn('[credit][skip] PATCH sin Id ni RUT');
    if (RUT == null)  return console.warn('[credit][skip] PATCH sin RUT');

    const eventPayload = buildCustomerCreditUpsertEvent({
      uuid: randomUUID(),
      nowISO: new Date().toISOString(),
      customer: {
        id: Id, rut: RUT, partnerType: PartnerType,
        groupNum, groupCode: GroupCode, listNum: ListNum,
        currency: Currency, email: Email, name,
      },
      credit: {
        limit: (payload?.creditLimit ?? updated?.CreditLimit ?? null),
        graceDays: 0,
        maxDaysPastDue: 30,
        notes: 'Actualización por PATCH de creditLimit',
      },
      trace: traceFromReq(req),
    });

    await sendCustomerCreditUpsert({
      key: String(Id ?? RUT ?? 'unknown'),
      value: eventPayload,
    });

    console.log('[customer.credit.upsert] PATCH emitido para', Id);
  } catch (e) {
    console.error('⚠️ customer.credit.upsert PATCH no enviado:', e?.message || e);
  }
}

// Alias opcional
export { upsertCustomerCreditIfNeeded as upsertCustomerCredit };
