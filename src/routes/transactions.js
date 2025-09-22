import { Router } from 'express';
import * as ctrl from '../controllers/transactionsController.js';
import { apiKeyAuth } from '../middlewares/apiKeyAuth.js';
import { idempotencyKey } from '../middlewares/idempotencyKey.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const r = Router();
r.use(apiKeyAuth);

r.get('/credits/:id/transactions', asyncHandler(ctrl.listByCredit));
r.post('/credits/:id/transactions', idempotencyKey, asyncHandler(ctrl.createForCredit));

export default r;
