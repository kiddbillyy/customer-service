import { transactionSchema } from '../utils/validators.js';
import * as service from '../services/creditService.js';

export async function listByCredit(req, res){
  const data = await service.listTransactions(req.params.id);
  res.json(data);
}

export async function createForCredit(req, res){
  const body = transactionSchema.parse(req.body);
  const tx = await service.createTransaction(req.params.id, body);
  res.status(201).json(tx);
}
