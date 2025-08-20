import * as CM from '../models/customersModel.js';
import * as AM from '../models/addressesModel.js';
import * as OM from '../models/contactsModel.js';

export async function createCustomerWithDefaults(payload, { billTo, shipTo, defaultContact } = {}) {
  // Crea cliente
  const created = await CM.createCustomer(payload);

  // Direcciones opcionales
  if (billTo) {
    await AM.upsertAddress(created.Id, { ...billTo, addressType: 'B' });
    await CM.updateCustomer(created.Id, { defaultBillToCode: billTo.addressCode });
  }
  if (shipTo) {
    await AM.upsertAddress(created.Id, { ...shipTo, addressType: 'S' });
    await CM.updateCustomer(created.Id, { defaultShipToCode: shipTo.addressCode });
  }

  // Contacto opcional
  if (defaultContact) {
    const code = await OM.upsertContact(created.Id, defaultContact);
    await CM.updateCustomer(created.Id, { defaultContactCode: code });
  }
  return await CM.getCustomer(created.Id);
}
