// src/services/customerCreditService.js
import { randomUUID } from 'crypto';
import { sendCustomerCreditUpsert } from '../producer/producer.js';
import { buildCustomerCreditUpsertEvent } from '../utils/validators.js';

// -1 = contado; >= 0 = crédito
function isCreditTerms(groupNum) {
  return typeof groupNum === 'number' && groupNum >= 0;
}

function traceFromReq(req) {
  const t = {
    source: String(req?.originalUrl ?? 'unknown'),
    method: String(req?.method ?? 'UNKNOWN'),
    requestId: String(req?.id ?? req?.headers?.['x-request-id'] ?? ''), // <- podría venir vacío
    ip: String(req?.ip ?? 'unknown'),
    ua: String(req?.headers?.['user-agent'] ?? 'unknown'),
  };
  // Fallback fuerte si quedó vacío, 'null' o 'undefined'
  if (!t.requestId || t.requestId === 'null' || t.requestId === 'undefined') {
    t.requestId = randomUUID();
  }
  return t;
}

export async function upsertCustomerCreditIfNeeded({ created, payload, req }) {
  try {
    const groupNum = created?.GroupNum ?? created?.groupNum ?? payload?.groupNum ?? null;
    if (!isCreditTerms(groupNum)) return;

    const Id          = created?.Id ?? created?.id;
    const RUT         = created?.RUT ?? created?.rut ?? payload?.rut ?? null;
    const PartnerType = created?.PartnerType ?? created?.partnerType ?? null;
    const GroupCode   = created?.GroupCode ?? created?.groupCode ?? null;
    const ListNum     = created?.ListNum ?? created?.listNum ?? null;
    const Currency    = created?.Currency ?? created?.currency ?? 'CLP';
    const Email       = created?.Email ?? created?.email ?? null;
    const name        = [created?.FirstName ?? created?.firstName, created?.LastName ?? created?.lastName]
                         .filter(Boolean).join(' ') || String(Id ?? RUT ?? '');

    const eventPayload = buildCustomerCreditUpsertEvent({
      uuid: randomUUID(),
      nowISO: new Date().toISOString(),
      customer: { id: Id, rut: RUT, partnerType: PartnerType, groupNum, groupCode: GroupCode, listNum: ListNum, currency: Currency, email: Email, name },
      credit: { limit: created?.CreditLimit ?? null, graceDays: 0, maxDaysPastDue: 30, notes: 'Alta automática por términos de pago crédito' },
      trace: traceFromReq(req), // ✅ siempre string
    });

    await sendCustomerCreditUpsert({
      key: String(Id ?? RUT ?? ''),
      value: eventPayload,
    });

    console.log('[customer.credit.upsert] emitido para', Id ?? RUT);
  } catch (e) {
    console.error('⚠️ customer.credit.upsert no enviado:', e?.message || e);
  }
}
