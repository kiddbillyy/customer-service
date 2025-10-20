// src/controllers/masterDataController.js
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as MD from '../models/masterDataModel.js';
import {
  partnerType,
  paymentTermsCreate,
  customerGroupsCreate,
  paymentTermsPatch,
  customerGroupsPatch,
} from '../utils/validators.js';

/* ============ Payment Terms ============ */
export const getPaymentTerms = asyncHandler(async (_req, res) => {
  res.json(await MD.listPaymentTerms());
});

export const postPaymentTerms = asyncHandler(async (req, res) => {
  const onConflict = String(req.query.onConflict || 'error').toLowerCase(); // error|ignore|replace
  const items = paymentTermsCreate.parse(req.body);
  const { status, payload } = await MD.createPaymentTerms(items, onConflict);
  res.status(status).json(payload);
});

export const patchPaymentTerm = asyncHandler(async (req, res) => {
  const groupNum = z.coerce.number().int().parse(req.params.groupNum);
  const patch = paymentTermsPatch.parse(req.body);
  const row = await MD.updatePaymentTerm(groupNum, patch);
  if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
  // Por si el modelo retorna errores tipados
  if (row?.http) return res.status(row.http).json({ error: row.error, details: row.details });
  res.json(row);
});

export const deletePaymentTerm = asyncHandler(async (req, res) => {
  const groupNum = z.coerce.number().int().parse(req.params.groupNum);
  const hard = String(req.query.hard || 'false').toLowerCase() === 'true';
  const result = await MD.deletePaymentTerm(groupNum, hard);
  if (!result.ok) return res.status(404).json({ error: 'NOT_FOUND' });
  res.status(200).json(result); // { ok:true, hardDeleted:bool, softDeactivated:bool }
});

/* ============ Price Lists ============ */
export const getPriceLists = asyncHandler(async (_req, res) => {
  res.json(await MD.listPriceLists());
});

/* ============ Customer Groups ============ */
export const getCustomerGroups = asyncHandler(async (req, res) => {
  const pt = req.query.partnerType ? partnerType.parse(req.query.partnerType) : undefined;
  res.json(await MD.listCustomerGroups(pt));
});

export const postCustomerGroups = asyncHandler(async (req, res) => {
  const onConflict = String(req.query.onConflict || 'error').toLowerCase(); // error|ignore|replace
  const items = customerGroupsCreate.parse(req.body);
  const { status, payload } = await MD.createCustomerGroups(items, onConflict);
  res.status(status).json(payload);
});

export const patchCustomerGroup = asyncHandler(async (req, res) => {
  const groupCode = z.coerce.number().int().parse(req.params.groupCode);
  const patch = customerGroupsPatch.parse(req.body);
  const row = await MD.updateCustomerGroup(groupCode, patch);
  if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
  if (row?.http) return res.status(row.http).json({ error: row.error, details: row.details });
  res.json(row);
});

export const deleteCustomerGroup = asyncHandler(async (req, res) => {
  const groupCode = z.coerce.number().int().parse(req.params.groupCode);
  const hard = String(req.query.hard || 'false').toLowerCase() === 'true';
  const result = await MD.deleteCustomerGroup(groupCode, hard);
  if (!result.ok) return res.status(404).json({ error: 'NOT_FOUND' });
  res.status(200).json(result);
});
