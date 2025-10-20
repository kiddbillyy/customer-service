// src/routes/masterdata.js
import { Router } from 'express';
import * as ctl from '../controllers/masterDataController.js';

const r = Router();

// Payment Terms
r.get('/payment-terms', ctl.getPaymentTerms);
r.post('/payment-terms', ctl.postPaymentTerms);
r.patch('/payment-terms/:groupNum', ctl.patchPaymentTerm);     // nombre EXACTO
r.delete('/payment-terms/:groupNum', ctl.deletePaymentTerm);   // nombre EXACTO

// Price Lists
r.get('/price-lists', ctl.getPriceLists);

// Customer Groups
r.get('/customer-groups', ctl.getCustomerGroups);
r.post('/customer-groups', ctl.postCustomerGroups);
r.patch('/customer-groups/:groupCode', ctl.patchCustomerGroup); // nombre EXACTO
r.delete('/customer-groups/:groupCode', ctl.deleteCustomerGroup);

export default r;
