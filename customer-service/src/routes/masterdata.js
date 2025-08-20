import { Router } from 'express';
import * as ctl from '../controllers/masterDataController.js';

const r = Router();

// Payment Terms
r.get('/payment-terms', ctl.getPaymentTerms);
r.post('/payment-terms', ctl.postPaymentTerms);
r.patch('/payment-terms/:groupNum', ctl.patchPaymentTerm);      // ← NUEVO
r.delete('/payment-terms/:groupNum', ctl.deletePaymentTerm);    // ← NUEVO

// Price Lists (solo GET por ahora)
r.get('/price-lists', ctl.getPriceLists);

// Customer Groups
r.get('/customer-groups', ctl.getCustomerGroups);
r.post('/customer-groups', ctl.postCustomerGroups);
r.patch('/customer-groups/:groupCode', ctl.patchCustomerGroup);  // ← NUEVO
r.delete('/customer-groups/:groupCode', ctl.deleteCustomerGroup);// ← NUEVO

export default r;
