// ejemplo rápido de siembra. Ejecuta con: node src/jobs/seedExample.js
import dotenv from 'dotenv';
dotenv.config();

import { createCustomerWithDefaults } from '../services/customersService.js';

const payload = {
  id: '76004335C', partnerType: 'C', rut: '76004335',
  firstName: 'Ana', lastName: 'González', email: 'ana@example.com',
  groupNum: 2, listNum: 1, currency: 'CLP'
};

createCustomerWithDefaults(payload, {
  billTo: { addressCode: 'FACT', addressName: 'Facturación', addressType: 'B', street: 'Av. Siempre Viva 742', city: 'Santiago' },
  shipTo: { addressCode: 'DESP', addressName: 'Despacho', addressType: 'S', street: 'Av. Apoquindo 3000', city: 'Las Condes' },
  defaultContact: { name: 'María Pérez', eMail: 'maria@example.com', mobile: '+56 9 1111 2222' }
}).then(x => {
  console.log('OK', x?.Id);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
