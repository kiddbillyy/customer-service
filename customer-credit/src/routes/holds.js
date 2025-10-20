import { Router } from 'express';
import * as ctrl from '../controllers/holdsController.js';
import { apiKeyAuth } from '../middlewares/apiKeyAuth.js';
import { idempotencyKey } from '../middlewares/idempotencyKey.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const r = Router();
r.use(apiKeyAuth);

r.post('/credits/:id/holds', idempotencyKey, asyncHandler(ctrl.create));
r.delete('/holds/:holdId', asyncHandler(ctrl.release));
r.post('/holds/:holdId/consume', asyncHandler(ctrl.consume));

export default r;
