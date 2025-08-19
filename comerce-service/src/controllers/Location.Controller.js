// controllers/Locations.Controller.js
const locationModel = require('../models/LocationsModels');

function mustString(s) {
  return typeof s === 'string' ? s.trim() : s;
}

async function createLocation(req, res) {
  try {
    const {
      storeId,
      name,
      country,
      stateProvince,
      city,
      addressLine1,
      addressLine2,
      postalCode,
      status = 'active',
      user
    } = req.body;

    const out = await locationModel.createLocation({
      storeId: Number(storeId),
      name: mustString(name),
      country: mustString(country),
      stateProvince: mustString(stateProvince),
      city: mustString(city),
      addressLine1: mustString(addressLine1),
      addressLine2: mustString(addressLine2),
      postalCode: mustString(postalCode),
      status,
      user
    });

    return res.status(201).json({ id: String(out.id), message: 'Location creada exitosamente.' });
  } catch (err) {
    console.error(err);
    const map = {
      STORE_ID_REQUIRED: 400,
      NAME_REQUIRED: 400,
      STORE_NOT_FOUND: 404
    };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al crear location.' });
  }
}

async function updateLocation(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'id inválido' });

    const {
      storeId,
      name,
      country,
      stateProvince,
      city,
      addressLine1,
      addressLine2,
      postalCode,
      status = 'active',
      user
    } = req.body;

    const out = await locationModel.updateLocation({
      id,
      storeId: Number(storeId),
      name: mustString(name),
      country: mustString(country),
      stateProvince: mustString(stateProvince),
      city: mustString(city),
      addressLine1: mustString(addressLine1),
      addressLine2: mustString(addressLine2),
      postalCode: mustString(postalCode),
      status,
      user
    });

    return res.status(200).json({ id: String(out.id), message: 'Location actualizada.' });
  } catch (err) {
    console.error(err);
    const map = {
      LOCATION_NOT_FOUND: 404,
      STORE_ID_REQUIRED: 400,
      NAME_REQUIRED: 400,
      STORE_NOT_FOUND: 404
    };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al actualizar location.' });
  }
}
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

async function patchLocationHandler(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'id inválido' });

    const b = req.body;
    const payload = { id };

    if (has(b, 'storeId'))      payload.storeId = Number(b.storeId);
    if (has(b, 'name'))         payload.name = b.name;
    if (has(b, 'country'))      payload.country = b.country;
    if (has(b, 'stateProvince'))payload.stateProvince = b.stateProvince;
    if (has(b, 'city'))         payload.city = b.city;
    if (has(b, 'addressLine1')) payload.addressLine1 = b.addressLine1;
    if (has(b, 'addressLine2')) payload.addressLine2 = b.addressLine2;
    if (has(b, 'postalCode'))   payload.postalCode = b.postalCode;
    if (has(b, 'status'))       payload.status = b.status;
    if (has(b, 'user'))         payload.user = b.user;

    const out = await locationModel.patchLocation(payload);
    return res.status(200).json({
      id: String(out.id),
      changed: !!out.changed,
      message: out.changed ? 'Location actualizada.' : 'Sin cambios.'
    });
  } catch (err) {
    console.error(err);
    const map = {
      LOCATION_NOT_FOUND: 404,
      STORE_ID_REQUIRED: 400,
      NAME_REQUIRED: 400,
      STORE_NOT_FOUND: 404
    };
    return res.status(map[err.message] || 500)
      .json({ message: err.message || 'Error al actualizar location.' });
  }
}




async function getLocationById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'id inválido' });

    const row = await locationModel.getLocationById({ id });
    if (!row) return res.status(404).json({ message: 'Location no encontrada.' });
    return res.status(200).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error al obtener location.' });
  }
}

async function listLocations(req, res) {
  try {
    const storeId = req.query.storeId ? parseInt(req.query.storeId, 10) : null;
    const status = req.query.active ?? null; // 'true'|'false'|'active'|'inactive'|null
    const search = req.query.q ?? null;
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 50;

    const items = await locationModel.listLocations({ storeId, status, search, page, pageSize });
    return res.status(200).json({ total: items.length, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error al listar locations.' });
  }
}

module.exports = {
  createLocation,
  updateLocation,
  patchLocationHandler,
  getLocationById,
  listLocations
};
