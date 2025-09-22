import { creditUpsertSchema } from '../utils/validators.js';
import * as service from '../services/creditService.js';

export async function upsertCredit(req, res){
  const body = creditUpsertSchema.parse(req.body);
  const result = await service.upsert(body);
  res.status(201).json(result);
}

export async function listCredits(req, res){
  const { customerId, cardCode, isBlocked } = req.query;
  const list = await service.list({ customerId, cardCode, isBlocked });
  res.json(list);
}

export async function getCredit(req, res){
  const credit = await service.get(req.params.id);
  if(!credit) return res.status(404).json({error:'Not found'});
  res.json(credit);
}

export async function patchCredit(req, res){
  const result = await service.patch(req.params.id, req.body);
  res.json(result);
}

export async function recalculate(req, res){
  await service.recalculate(req.params.id);
  res.status(204).end();
}
