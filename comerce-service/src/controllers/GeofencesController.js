// controllers/Geofences.Controller.js
const geofenceModel = require('../models/Geofences.Model');
const { publishGeofenceEvent } = require('../utils/Kafka/GeofenceEvents')

// POST /geofences
async function createGeofence(req, res) {
  const { name, status = 'active', description = null, coverage, user  } = req.body;

  if (!name || !Array.isArray(coverage) || coverage.length === 0) {
    return res.status(400).json({ message: 'name y coverage son requeridos.' });
  }

  try {
    const full = await geofenceModel.createGeofence({ name, status, description, coverage, user });
    
    (async () => {
      try {
        await publishGeofenceEvent({
          action: 'geofence.created',
          geofence: full ?? { id: full.id, name, status, description, coverage },
          userId: user || 'API',
        });
      } catch (e) {
        console.error('Kafka publish geofence.created failed:', e);
      }
    })();
    
    
    return res.status(201).json({ id: String(full.id), message: 'Geofence creada exitosamente.' });
  } catch (err) {
    console.error(err);
    const map = {
      INVALID_COVERAGE: 400,
    };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al crear geofence.' });
  }
}

// PUT /geofences/:id
async function updateGeofence(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'id inválido' });

  const { name, status = 'active', description = null, coverage, user } = req.body;
  if (!name || !Array.isArray(coverage) || coverage.length === 0) {
    return res.status(400).json({ message: 'name y coverage son requeridos.' });
  }

  try {
    const full = await geofenceModel.updateGeofence({ id, name, status, description, coverage, user });
      
     (async () => {
      try {
        await publishGeofenceEvent({
          action: 'geofence.updated',
          geofence: full ?? { id, name, status, description, coverage },
          userId: user || 'API',
        });
      } catch (e) {
        console.error('Kafka publish geofence.updated failed:', e);
      }
    })();
    
    return res.status(200).json({ id: String(id), message: 'Geofence actualizada.' });
  } catch (err) {
    console.error(err);
    const map = {
      INVALID_COVERAGE: 400,
      GEOFENCE_NOT_FOUND: 404,
    };
    return res.status(map[err.message] || 500).json({ message: err.message || 'Error al actualizar geofence.' });
  }
}

// GET /geofences/:id
async function getGeofenceById(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'id inválido' });

  try {
    const g = await geofenceModel.getGeofenceById({ id });
    if (!g) return res.status(404).json({ message: 'Geofence no encontrada.' });
    return res.status(200).json(g);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error al obtener geofence.' });
  }
}

// GET /geofences
async function listGeofences(_req, res) {
  try {
    const list = await geofenceModel.listGeofences();
    return res.status(200).json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error al listar geofences.' });
  }
}

module.exports = { createGeofence, updateGeofence, getGeofenceById, listGeofences };
