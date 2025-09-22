// src/utils/validators.js
import { z } from 'zod';

// id = cuerpoRUT + (C|P)
export const idRutType = z.string().regex(/^\d+[CP]$/);

// normaliza partnerType a mayúsculas
export const partnerType = z.string()
  .transform(s => String(s).trim().toUpperCase())
  .pipe(z.enum(['C', 'P']));

// calcula DV módulo 11
function calcDV(cuerpo) {
  let sum = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    sum += Number(cuerpo[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  return res === 11 ? '0' : res === 10 ? 'K' : String(res);
}

/** rutWithDV:
 *  - Acepta con/sin puntos; con/sin guión
 *  - Requiere DV (0-9 o K/k)
 *  - Devuelve "########-DV" (DV en mayúscula)
 */
const rutWithDV = z.string().transform((s, ctx) => {
  const raw = String(s ?? '').trim().toUpperCase().replace(/\./g, '');
  const m = raw.match(/^(\d{1,12})-?([0-9K])$/);
  if (!m) {
    ctx.addIssue({ code: z.ZodIssueCode.custom,
      message: 'RUT inválido. Usa 33333333-3 (con DV).' });
    return z.NEVER;
  }
  const cuerpo = m[1];
  const dv = m[2];
  const expected = calcDV(cuerpo);
  if (dv !== expected) {
    ctx.addIssue({ code: z.ZodIssueCode.custom,
      message: `Dígito verificador inválido. Debe ser ${expected}.` });
    return z.NEVER;
  }
  return `${cuerpo}-${dv}`;
});

// ===== Esquema base =====
const customerBase = z.object({
  id: idRutType,              // ej: 33333333C
  partnerType,                // 'C' | 'P' (normalizado)
  rut: rutWithDV,             // ej: 33333333-3  ← se guarda ASÍ
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(40).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  country: z.string().max(3).optional().nullable(),
  notes: z.string().max(255).optional().nullable(),
  groupCode: z.number().int().optional().nullable(),
  groupNum: z.number().int().optional().nullable(),
  listNum: z.number().int().optional().nullable(),
  currency: z.string().max(3).optional().nullable(),
  creditLimit: z.number().finite().optional().nullable(),
  discountPercent: z.number().finite().optional().nullable(),
  defaultBillToCode: z.string().max(50).optional().nullable(),
  defaultShipToCode: z.string().max(50).optional().nullable(),
  defaultContactCode: z.number().int().optional().nullable()
});

// ===== Create estricto: id debe ser cuerpoRUT + partnerType =====
export const customerCreate = customerBase.superRefine((v, ctx) => {
  const cuerpo = v.rut.split('-')[0];           // "33333333-3" -> "33333333"
  const expected = `${cuerpo}${v.partnerType}`; // -> "33333333C"
  if (v.id !== expected) {
    ctx.addIssue({
      path: ['id'],
      code: z.ZodIssueCode.custom,
      message: `id debe ser ${expected} (cuerpo RUT + 'C'/'P')`
    });
  }
});

// ===== Create “cómodo”: id opcional, se deriva si falta =====
const customerCreateLooseBase = customerBase.extend({
  id: idRutType.optional()
});
export const customerCreateLoose = customerCreateLooseBase
  .transform(v => {
    const cuerpo = v.rut.split('-')[0];
    return { ...v, id: v.id ?? `${cuerpo}${v.partnerType}` };
  })
  .pipe(customerCreate); // valida coherencia final

// ===== Patch parcial =====
export const customerPatch = customerBase
  .partial()
  .superRefine((v, ctx) => {
    if (v.id && (v.rut || v.partnerType)) {
      const cuerpo = v.rut ? v.rut.split('-')[0] : undefined;
      const tipo = v.partnerType;
      if (cuerpo && tipo) {
        const expected = `${cuerpo}${tipo}`;
        if (v.id !== expected) {
          ctx.addIssue({
            path: ['id'],
            code: z.ZodIssueCode.custom,
            message: `id debe ser ${expected} (cuerpo RUT + 'C'/'P')`
          });
        }
      }
    }
    if (Object.keys(v).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'payload vacío' });
    }
  });

// ===== Address (CRD1) =====  ← DECLARAR ANTES DE addressesCreate
export const addressUpsert = z.object({
  addressCode: z.string().min(1).max(50),
  addressName: z.string().min(1).max(100),
  addressType: z.enum(['B', 'S', 'O']),
  street: z.string().min(1).max(255),
  streetNo: z.string().max(20).optional().nullable(),
  building: z.string().max(100).optional().nullable(),
  block: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  county: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  zipCode: z.string().max(20).optional().nullable(),
  country: z.string().max(3).optional().nullable(),
  notes: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional()
});

export const addressesCreate = z.union([
  z.array(addressUpsert).min(1),
  addressUpsert
]).transform(v => Array.isArray(v) ? v : [v]);
// ===== Contact (OCPR) =====
const normalizeContact = (raw) => {
  if (raw && typeof raw === 'object') {
    if (raw.contactcode && !raw.contactCode) raw.contactCode = raw.contactcode;
    if (raw.ContactCode && !raw.contactCode) raw.contactCode = raw.ContactCode;
  }
  return raw;
};

export const addressesWithBillTo = addressesCreate.refine(
  arr => arr.some(a => a.addressType === 'B'),
  { message: 'Se requiere al menos una dirección de facturación (addressType="B")' }
);

// 🚑 CORRECTO: extender el *OBJETO BASE*, NO el effects
export const customerCreateWithAddrs = customerBase
  .extend({
    // si no quieres forzar B, puedes usar: addresses: addressesCreate.optional()
    addresses: addressesWithBillTo.optional()
  })
  .superRefine((v, ctx) => {
    const expected = `${v.rut.split('-')[0]}${v.partnerType}`;
    if (v.id !== expected) {
      ctx.addIssue({
        path: ['id'],
        code: z.ZodIssueCode.custom,
        message: `id debe ser ${expected} (cuerpo RUT + 'C'/'P')`
      });
    }
  });

// --- schema de 1 contacto (upsert) ---
export const contactUpsert = z.preprocess(
  normalizeContact,
  z.object({
    contactCode: z.string().min(1).max(50),      // ← string requerido
    name: z.string().min(1).max(100),
    position: z.string().max(100).optional().nullable(),
    eMail: z.string().email().max(255).optional().nullable(),
    phone1: z.string().max(40).optional().nullable(),
    phone2: z.string().max(40).optional().nullable(),
    mobile: z.string().max(40).optional().nullable(),
    remarks: z.string().max(255).optional().nullable(),
    isActive: z.boolean().optional()
  })
);

// --- schema para crear 1 o N contactos en POST ---
export const contactsCreate = z.preprocess(
  (v) => Array.isArray(v) ? v.map(normalizeContact) : normalizeContact(v),
  z.union([ z.array(contactUpsert).min(1), contactUpsert ])
).transform(v => Array.isArray(v) ? v : [v]); 

export const paymentTermUpsert = z.object({
  groupNum: z.number().int().min(1),
  pymntGroup: z.string().min(1).max(100),
  extraDays: z.number().int().min(0).default(0),
  installments: z.number().int().min(1).optional().nullable(),
  isActive: z.boolean().optional() // si no viene, en SQL defaults a 1
});

export const paymentTermsCreate = z.union([
  z.array(paymentTermUpsert).min(1),
  paymentTermUpsert
]).transform(v => Array.isArray(v) ? v : [v]);

export const customerGroupUpsert = z.object({
  groupCode: z.number().int().min(1),
  groupName: z.string().min(1).max(100),
  partnerType,                // usa el schema ya definido: 'C' | 'P' (normaliza a mayúscula)
  isActive: z.boolean().optional()   // default 1 en SQL si no viene
});

export const customerGroupsCreate = z.union([
  z.array(customerGroupUpsert).min(1),
  customerGroupUpsert
]).transform(v => Array.isArray(v) ? v : [v]);

export const paymentTermsPatch = z.object({
  pymntGroup: z.string().min(1).max(100).optional(),
  extraDays: z.number().int().min(0).max(3650).optional(),
  installments: z.number().int().min(1).max(60).nullable().optional(),
  isActive: z.boolean().optional()
}).refine(v => Object.keys(v).length > 0, { message: 'payload vacío' });

export const customerGroupsPatch = z.object({
  groupName: z.string().min(1).max(100).optional(),
  partnerType: partnerType.optional(), // 'C'|'P'
  isActive: z.boolean().optional()
}).refine(v => Object.keys(v).length > 0, { message: 'payload vacío' });


export const sapPriceListEvent = z.object({
  listNum: z.number().int().min(1),
  listName: z.string().min(1).max(100),
  createDate: z.coerce.date().optional() // acepta string/Date; opcional
});

export const customerCreditUpsertEvent = z.object({
  eventType: z.literal("customer.credit.upsert"),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  producer: z.literal("customer-service"),
  customer: z.object({
    id: z.string().min(3),
    rut: z.string().min(5),
    partnerType: z.enum(["C","P"]),
    groupNum: z.number().int().nullable().optional(),  // términos de pago (SAP OCTG)
    groupCode: z.number().int().nullable().optional(), // grupo de cliente (OCRG)
    listNum: z.number().int().nullable().optional(),   // lista de precios (OPLN)
    currency: z.string().min(2).optional(),
    email: z.string().email().nullable().optional(),
    name: z.string().min(1).optional(),
  }),
  credit: z.object({
    limit: z.number().int().nullable().optional(),
    graceDays: z.number().int().nullable().optional(),
    maxDaysPastDue: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).optional(),
  trace: z.object({
    source: z.string().optional(),
    requestId: z.string().optional(),
    ip: z.string().optional(),
  }).optional(),
});

export function buildCustomerCreditUpsertEvent({ uuid, nowISO, customer, credit, trace }) {
  const evt = {
    eventType: "customer.credit.upsert",
    eventId: uuid,
    occurredAt: nowISO,
    producer: "customer-service",
    customer,
    credit,
    trace,
  };
  return customerCreditUpsertEvent.parse(evt);
}