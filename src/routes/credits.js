import { Router } from 'express';
import * as ctrl from '../controllers/creditsController.js';
import { apiKeyAuth } from '../middlewares/apiKeyAuth.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const r = Router();
r.use(apiKeyAuth);

r.post('/', asyncHandler(ctrl.upsertCredit));
r.get('/', asyncHandler(ctrl.listCredits));
r.get('/:id', asyncHandler(ctrl.getCredit));
r.patch('/:id', asyncHandler(ctrl.patchCredit));
r.post('/:id/recalculate', asyncHandler(ctrl.recalculate));

export default r;
