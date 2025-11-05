import { Router } from 'express';
import { webhookHandler } from '../controllers/webhookController.js';


const router = Router();


router.post(['/meli/webhook', '/'], webhookHandler);

export default router;