import { Router } from 'express';
import * as ctl from '../controllers/customersController.js';

const r = Router();

// /customers
r.get('/find', ctl.findCustomersByName);    // <— NUEVO: /customers/find?q=ana

r.get('/', ctl.list);
r.get('/:id', ctl.getOne);

r.post('/', ctl.create);
r.patch('/:id', ctl.patch);
r.delete('/:id', ctl.remove);

// nested: /customers/:id/addresses
r.get('/:id/addresses', ctl.listAddresses);
r.put('/:id/addresses', ctl.upsertAddressCtl);              // body = addressUpsert
r.delete('/:id/addresses/:addressCode', ctl.deleteAddress);
r.post('/:id/addresses', ctl.postAddresses);

// nested: /customers/:id/contacts
r.get('/:id/contacts', ctl.listContacts);
r.post('/:id/contacts', ctl.postContacts);    
r.put('/:id/contacts', ctl.upsertContactCtl);               // body = contactUpsert (si trae contactCode → update)
r.delete('/:id/contacts/:contactCode', ctl.deleteContact);
r.get('/:id/contacts/:contactCode', ctl.getContactByCode);


export default r;
