// src/services/customerCreditService.js
import { randomUUID } from 'crypto';
import { sendCustomerCreditUpsert } from '../producer/producer.js';
import { buildCustomerCreditUpsertEvent } from '../utils/validators.js';

// Regla: -1 = contado; >= 0 = crédito
function isCreditTerms(groupNum) {
  return typeof groupNum === 'number' && groupNum >= 0;
}

function traceFromReq(req) {
  // ⚠️ Solo campos planos; nada de objetos grandes (req/socket)
  return {
    source: req?.originalUrl ?? 'unknown',
    method: req?.method ?? 'GET',
    requestId: req?.id ?? null,
    ip: req?.ip ?? null,
    ua: req?.headers?.['user-agent'] ?? null,
  };
}

/**
 * Construye y envía customer.credit.upsert SOLO si el cliente tiene términos de CRÉDITO.
 * No lanza error; loguea y continúa (best-effort).
 */
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
                         .filter(Boolean).join(' ') || Id || RUT;

    // Evento plano y serializable
    const eventPayload = buildCustomerCreditUpsertEvent({
      uuid: randomUUID(),
      nowISO: new Date().toISOString(),
      customer: {
        id: Id,
        rut: RUT,
        partnerType: PartnerType,
        groupNum,
        groupCode: GroupCode,
        listNum: ListNum,
        currency: Currency,
        email: Email,
        name,
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
      value: eventPayload, // <— plano; el producer hará JSON.stringify
    });

    console.log('[customer.credit.upsert] emitido para', Id ?? RUT);
  } catch (e) {
    console.error('⚠️ customer.credit.upsert no enviado:', e?.message || e);
  }
}

// (opcional) alias si en otra parte llamas upsertCustomerCredit(...)
export { upsertCustomerCreditIfNeeded as upsertCustomerCredit };
