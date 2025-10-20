import { holdSchema } from '../utils/validators.js';
import * as holdService from '../services/holdService.js';

export async function create(req, res){
  const body = holdSchema.parse(req.body);
  const hold = await holdService.placeHold(req.params.id, body);
  res.status(201).json(hold);
}

export async function release(req, res){
  await holdService.releaseHold(req.params.holdId);
  res.status(204).end();
}

export async function consume(req, res){
  const consumed = await holdService.consumeHold(req.params.holdId);
  res.json(consumed);
}
