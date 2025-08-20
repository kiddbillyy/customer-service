import { asyncHandler } from '../utils/asyncHandler.js';
import * as MD from '../models/masterDataModel.js';
import { partnerType, paymentTermsCreate, customerGroupsCreate } from '../utils/validators.js';


export const getPaymentTerms = asyncHandler(async (_req, res) => {
  res.json(await MD.listPaymentTerms());
});

export const getPriceLists = asyncHandler(async (_req, res) => {
  res.json(await MD.listPriceLists());
});


export const getCustomerGroups = asyncHandler(async (req, res) => {
  const pt = req.query.partnerType ? partnerType.parse(req.query.partnerType) : undefined;
  res.json(await MD.listCustomerGroups(pt));
});

export const postPaymentTerms = asyncHandler(async (req, res) => {
  const onConflict = String(req.query.onConflict || 'error').toLowerCase(); // error|ignore|replace
  const items = paymentTermsCreate.parse(req.body);
  const { status, payload } = await MD.createPaymentTerms(items, onConflict);
  res.status(status).json(payload);
});

export const postCustomerGroups = asyncHandler(async (req, res) => {
  const onConflict = String(req.query.onConflict || 'error').toLowerCase(); // error|ignore|replace
  const items = customerGroupsCreate.parse(req.body);
  const { status, payload } = await MD.createCustomerGroups(items, onConflict);
  res.status(status).json(payload);
});
