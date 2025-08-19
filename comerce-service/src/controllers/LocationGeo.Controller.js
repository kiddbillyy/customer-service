// controllers/LocationGeo.Controller.js
const model = require('../models/LocationGeoModels');

// POST /location-geo
async function createLink(req, res) {
  try {
    const { locationId, geofenceId } = req.body;
    const out = await model.link({ locationId: Number(locationId), geofenceId: Number(geofenceId) });
    const msg = out.duplicated ? 'Vínculo ya existía.' : 'Vínculo creado exitosamente.';
    return res.status(out.duplicated ? 200 : 201).json({ id: String(out.id), message: msg });
  } catch (err) {
    console.error(err);
    const map = {
      INVALID_LOCATION_ID: 400,
      INVALID_GEOFENCE_ID: 400,
      LOCATION_NOT_FOUND: 404,
      GEOFENCE_NOT_FOUND: 404
    };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al vincular.' });
  }
}

// DELETE /location-geo/:id
async function deleteLinkById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const out = await model.unlinkById({ id });
    return res.status(200).json({ id: String(out.id), message: 'Vínculo eliminado.' });
  } catch (err) {
    console.error(err);
    const map = { INVALID_LINK_ID: 400, LINK_NOT_FOUND: 404 };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al eliminar vínculo.' });
  }
}

// DELETE /location-geo?locationId=&geofenceId=
async function deleteLinkByPair(req, res) {
  try {
    const locationId = req.query.locationId ? parseInt(req.query.locationId, 10) : null;
    const geofenceId = req.query.geofenceId ? parseInt(req.query.geofenceId, 10) : null;
    const out = await model.unlinkByPair({ locationId, geofenceId });
    return res.status(200).json({ locationId: out.locationId, geofenceId: out.geofenceId, message: 'Vínculo eliminado.' });
  } catch (err) {
    console.error(err);
    const map = { INVALID_PARAMS: 400, LINK_NOT_FOUND: 404 };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al eliminar vínculo.' });
  }
}

// GET /location-geo/by-location/:locationId?includeCoverage=true&active=true
async function getGeofencesForLocation(req, res) {
  try {
    const locationId = parseInt(req.params.locationId, 10);
    const includeCoverage = (req.query.includeCoverage ?? 'true').toString().toLowerCase() !== 'false';
    const active = req.query.active ?? null;
    const items = await model.getGeofencesByLocation({ locationId, includeCoverage, onlyActive: active });
    return res.status(200).json({ total: items.length, items });
  } catch (err) {
    console.error(err);
    const map = { INVALID_LOCATION_ID: 400 };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al obtener geofences.' });
  }
}

// GET /location-geo/by-geofence/:geofenceId?active=true
async function getLocationsForGeofence(req, res) {
  try {
    const geofenceId = parseInt(req.params.geofenceId, 10);
    const active = req.query.active ?? null;
    const items = await model.getLocationsByGeofence({ geofenceId, onlyActive: active });
    return res.status(200).json({ total: items.length, items });
  } catch (err) {
    console.error(err);
    const map = { INVALID_GEOFENCE_ID: 400 };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al obtener locations.' });
  }
}

// GET /location-geo?locationId=&geofenceId=&page=&pageSize=
async function listLinks(req, res) {
  try {
    const locationId = req.query.locationId ? parseInt(req.query.locationId, 10) : null;
    const geofenceId = req.query.geofenceId ? parseInt(req.query.geofenceId, 10) : null;
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 100;
    const items = await model.listLinks({ locationId, geofenceId, page, pageSize });
    return res.status(200).json({ total: items.length, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error al listar vínculos.' });
  }
}

module.exports = {
  createLink,
  deleteLinkById,
  deleteLinkByPair,
  getGeofencesForLocation,
  getLocationsForGeofence,
  listLinks
};
