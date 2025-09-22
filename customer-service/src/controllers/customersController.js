// src/controllers/customersController.js
import { asyncHandler } from '../utils/asyncHandler.js';
import * as CM from '../models/customersModel.js';
import * as AM from '../models/addressesModel.js';
import { searchByName } from '../models/customersModel.js';
import * as OM from '../models/contactsModel.js';
import { randomUUID } from 'crypto';
import { sendCustomerCreditUpsert } from '../producer/producer.js';
import { buildCustomerCreditUpsertEvent } from '../utils/validators.js';
import {
   customerCreateWithAddrs as customerCreate,
  customerPatch,
  idRutType,
  addressesCreate,
  addressUpsert,
  contactsCreate,
  contactUpsert,
  partnerType 
} from '../utils/validators.js';
import { z } from 'zod';
import { createBusinessPartner } from '../integrations/sapB1.js';
import { createCustomerInRpro } from '../integrations/rpro.js';


// Regla de ejemplo: -1 = contado; >= 0 = crédito (ajusta a tu codificación real)
function isCreditTerms(groupNum) {
  return typeof groupNum === 'number' && groupNum >= 0;
}
/* ===== Customers ===== */

// GET /customers
export const list = asyncHandler(async (req, res) => {
  const { q, partnerType: pt, groupCode, listNum, page, pageSize } = req.query;
  const data = await CM.listCustomers({
    q: q?.trim(),
    partnerType: pt ? partnerType.parse(pt) : undefined,
    groupCode: groupCode != null ? Number(groupCode) : undefined,
    listNum: listNum != null ? Number(listNum) : undefined,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Math.min(Number(pageSize), 100) : 20
  });
  res.json(data);
});

// GET /customers/:id
export const getOne = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const item = await CM.getCustomer(id);
  if (!item) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(item);
});

// GET /customers/find?q=...
export const findCustomersByName = asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'BAD_REQUEST', details: 'query "q" es requerido' });

  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize ?? '20', 10)));
  const includeDeleted = String(req.query.includeDeleted ?? 'false').toLowerCase() === 'true';
  const pt = req.query.partnerType ? partnerType.parse(req.query.partnerType) : undefined;

  const result = await searchByName({ name: q, partnerType: pt, page, pageSize, includeDeleted });
  res.json(result);
});

// POST /customers  (crea en SQL → guarda direcciones si vienen → integra SAP/RPRO)
export const create = asyncHandler(async (req, res) => {
  // 1) valida el customer (sin addresses embebidas)
  const payload = customerCreate.parse(req.body);

  // 2) si el request trae addresses, valídalas por separado
  const addresses = req.body.addresses
    ? addressesCreate.parse(req.body.addresses)
    : [];

  // 3) crea el cliente en tu BD
  const created = await CM.createCustomer(payload);

  // 4) si vinieron direcciones, guárdalas (onConflict=replace)
  if (addresses.length) {
    const { status, payload: addrResult } = await AM.createMany(
      created.Id || created.id, // por si tu driver devuelve "Id"
      addresses,
      'replace'
    );
    if (status >= 400) {
      return res.status(status).json({ error: 'ADDR_INSERT_FAILED', details: addrResult });
    }
  }

  // 5) mapea el registro de SQL a lo que espera SAP/RPRO
  const customerDTO = {
    id: created.Id ?? created.id,
    partnerType: created.PartnerType ?? created.partnerType,
    rut: created.RUT ?? created.rut,
    firstName: created.FirstName ?? created.firstName,
    lastName: created.LastName ?? created.lastName,
    email: created.Email ?? created.email,
    phone: created.Phone ?? created.phone,
    groupCode: created.GroupCode ?? created.groupCode,
    currency: created.Currency ?? created.currency,
    groupNum: (created.GroupNum ?? payload.groupNum ?? null),   // 👈 pásalo
    listNum: (created.ListNum ?? payload.listNum ?? null),       // 👈 pásalo
    // “Giro” va en OCRD.Notes; toma lo que venga del request (payload)
    notes: payload.notes ?? null,
  };

  // 6) integra con SAP y RPRO usando LAS MISMAS direcciones del request
  const [sap, rpro] = await Promise.allSettled([
    createBusinessPartner(customerDTO, addresses),
    createCustomerInRpro(customerDTO, addresses)
  ]);

  const integrations = {
    sapB1: sap.status === 'fulfilled'
      ? sap.value
      : { ok: false, error: String(sap.reason?.message || sap.reason) },
    rpro: rpro.status === 'fulfilled'
      ? rpro.value
      : { ok: false, error: String(rpro.reason?.message || rpro.reason) }
  };



  // --- Evento a customer-credit si la condición de pago es CRÉDITO ---
  try {
    // Preferir GroupNum del registro creado; si no existe, usa lo recibido en el payload (si lo manejas)
    const groupNum = created.GroupNum ?? created.groupNum ?? payload.groupNum ?? null;
    if (isCreditTerms(groupNum)) {
      const Id          = created.Id ?? created.id;
      const RUT         = created.RUT ?? created.rut;
      const PartnerType = created.PartnerType ?? created.partnerType;
      const GroupCode   = created.GroupCode ?? created.groupCode ?? null;
      const ListNum     = created.ListNum ?? created.listNum ?? null;
      const Currency    = created.Currency ?? created.currency ?? 'CLP';
      const Email       = created.Email ?? created.email ?? null;
      const name        = [created.FirstName ?? created.firstName, created.LastName ?? created.lastName]
                           .filter(Boolean).join(' ') || Id;

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
          name
        },
        credit: {
          limit: created.CreditLimit ?? null,  // si no lo manejas aún, deja null
          graceDays: 0,
          maxDaysPastDue: 30,
          notes: 'Alta automática por términos de pago crédito'
        },
        trace: { source: 'POST /customers', requestId: req.id, ip: req.ip }
      });

      await sendCustomerCreditUpsert({ key: Id, value: eventPayload });
    }
  } catch (e) {
    console.error('⚠️ customer.credit.upsert no enviado:', e?.message || e);
    // Best-effort: NO romper la 201
  }

  return res.status(201).json({ customer: created, integrations });
});

// PATCH /customers/:id
export const patch = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const payload = customerPatch.parse(req.body);
  const updated = await CM.updateCustomer(id, payload);
  if (!updated) return res.status(404).json({ error: 'NOT_FOUND_OR_DELETED' });
  res.json(updated);
});

// DELETE /customers/:id (soft delete)
export const remove = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const ok = await CM.softDeleteCustomer(id);
  if (!ok) return res.status(404).json({ error: 'NOT_FOUND_OR_ALREADY_DELETED' });
  res.status(204).end();
});

/* ===== Direcciones ===== */

// GET /customers/:id/addresses
export const listAddresses = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  res.json(await AM.listAddresses(id));
});

// PUT /customers/:id/addresses  (upsert uno)
export const upsertAddressCtl = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const body = addressUpsert.parse(req.body);
  await AM.upsertAddress(id, body);
  res.status(200).json({ ok: true });
});

// DELETE /customers/:id/addresses/:addressCode
export const deleteAddress = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const code = z.string().min(1).parse(req.params.addressCode);
  const ok = await AM.removeAddress(id, code);
  if (!ok) return res.status(404).json({ error: 'ADDRESS_NOT_FOUND' });
  res.status(204).end();
});

// POST /customers/:id/addresses?onConflict=error|ignore|replace  (bulk)
export const postAddresses = asyncHandler(async (req, res) => {
  const customerId = idRutType.parse(req.params.id);
  const sample = JSON.stringify(req.body);
  console.log('[POST /addresses] id=', customerId, 'body=', sample?.length > 1000 ? sample.slice(0, 1000) + '…' : sample);

  const onConflict = String(req.query.onConflict || 'error').toLowerCase(); // error|ignore|replace
  const items = addressesCreate.parse(req.body);

  const { status, payload } = await AM.createMany(customerId, items, onConflict);
  if (status >= 400) console.error('[addresses.createMany][FAIL]', { status, payload });
  return res.status(status).json(payload);
});

/* ===== Contactos ===== */

// GET /customers/:id/contacts
export const listContacts = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  res.json(await OM.listContacts(id));
});

// PUT /customers/:id/contacts  (upsert uno)
export const upsertContactCtl = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const body = contactUpsert.parse(req.body);
  const code = await OM.upsertContact(id, body);
  res.status(200).json({ ok: true, contactCode: code });
});

// POST /customers/:id/contacts?onConflict=error|ignore|replace  (bulk)
export const postContacts = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const onConflict = String(req.query.onConflict || 'error').toLowerCase();
  const items = contactsCreate.parse(req.body);
  const { status, payload } = await OM.createMany(id, items, onConflict);
  res.status(status).json(payload);
});

// DELETE /customers/:id/contacts/:contactCode
export const deleteContact = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const code = z.string().min(1).max(50).parse(req.params.contactCode); // ← string (no Number)
  const ok = await OM.removeContact(id, code);
  if (!ok) return res.status(404).json({ error: 'CONTACT_NOT_FOUND' });
  res.status(204).end();
});

// GET /customers/:id/contacts/:contactCode
export const getContactByCode = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const contactCode = z.string().min(1).max(50).parse(req.params.contactCode);
  const contact = await OM.getContactByCode(id, contactCode);
  if (!contact) return res.status(404).json({ error: 'CONTACT_NOT_FOUND' });
  res.json(contact);
});
