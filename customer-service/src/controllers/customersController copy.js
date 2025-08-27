import { asyncHandler } from '../utils/asyncHandler.js';
import * as CM from '../models/customersModel.js';
import * as AM from '../models/addressesModel.js';
import { searchByName } from '../models/customersModel.js';  
import * as OM from '../models/contactsModel.js';
import { customerCreate, customerPatch, idRutType,addressesCreate, addressUpsert,contactsCreate, contactUpsert, partnerType } from '../utils/validators.js';
import { z } from 'zod';

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
//por nombre
export const findCustomersByName = asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'BAD_REQUEST', details: 'query "q" es requerido' });

  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize ?? '20', 10)));
  const includeDeleted = String(req.query.includeDeleted ?? 'false').toLowerCase() === 'true';
  const partnerType = req.query.partnerType ? partnerTypeSchema.parse(req.query.partnerType) : undefined;

  const result = await searchByName({ name: q, partnerType, page, pageSize, includeDeleted });
  res.json(result);
});

// POST /customers
export const create = asyncHandler(async (req, res) => {
  const payload = customerCreate.parse(req.body);
  const created = await CM.createCustomer(payload);
  res.status(201).json(created);
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

// PUT /customers/:id/addresses
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

export const postAddresses = asyncHandler(async (req, res) => {
  const customerId = idRutType.parse(req.params.id);

  // log de entrada (corta el body a 1k para no ensuciar)
  const sample = JSON.stringify(req.body);
  console.log('[POST /addresses] id=', customerId, 'body=', sample?.length > 1000 ? sample.slice(0, 1000) + '…' : sample);

  const onConflict = String(req.query.onConflict || 'error').toLowerCase(); // error|ignore|replace
  const items = addressesCreate.parse(req.body);                            // <- si falla, caerá al error handler y verás [ZOD_ERROR]

  const { status, payload } = await AM.createMany(customerId, items, onConflict);

  // si el modelo reporta error, lo vemos en consola
  if (status >= 400) {
    console.error('[addresses.createMany][FAIL]', { status, payload });
  }

  return res.status(status).json(payload);
});

/* ===== Contactos ===== */

// GET /customers/:id/contacts
export const listContacts = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  res.json(await OM.listContacts(id));
});

export const upsertContactCtl = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const body = contactUpsert.parse(req.body);
  const code = await OM.upsertContact(id, body);
  res.status(200).json({ ok: true, contactCode: code });
});

// POST /customers/:id/contacts  (1 o N, con onConflict=error|ignore|replace)
export const postContacts = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const onConflict = String(req.query.onConflict || 'error').toLowerCase();
  const items = contactsCreate.parse(req.body);            // ← usa el validador correcto
  const { status, payload } = await OM.createMany(id, items, onConflict);
  res.status(status).json(payload);
});

// DELETE /customers/:id/contacts/:contactCode
export const deleteContact = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const code = Number(req.params.contactCode);
  const ok = await OM.removeContact(id, code);
  if (!ok) return res.status(404).json({ error: 'CONTACT_NOT_FOUND' });
  res.status(204).end();
});

export const getContactByCode = asyncHandler(async (req, res) => {
  const id = idRutType.parse(req.params.id);
  const contactCode = z.string().min(1).max(50).parse(req.params.contactCode);

  const contact = await OM.getContactByCode(id, contactCode);
  if (!contact) return res.status(404).json({ error: 'CONTACT_NOT_FOUND' });

  res.json(contact);
});
