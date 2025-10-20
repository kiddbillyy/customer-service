// src/routes/rebuild.js
import { Router } from 'express';
import { rebuildById, rebuildByURef1 } from '../controllers/rebuildController.js';

const router = Router();

// Ping de sanidad
router.get('/rebuild/ping', (_req, res) => res.json({ ok: true, at: '/mv/rebuild/ping' }));

// Rebuilds
router.post('/rebuild/by-id/:id', rebuildById);
router.post('/rebuild/by-uref1/:uRef1', rebuildByURef1);

export default router;
