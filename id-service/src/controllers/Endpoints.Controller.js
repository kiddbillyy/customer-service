// controllers/EndpointApiController.js
const endpointApiModel = require('../models/EndpointModels');

async function createEndpointApi(req, res) {
  const { subModuloId, metodoHttp, path, target, activo } = req.body;

  if (!subModuloId || !metodoHttp || !path) {
    return res.status(400).json({ message: 'subModuloId, metodoHttp y path son requeridos.' });
  }

  try {
    const out = await endpointApiModel.createEndpointApi({ subModuloId, metodoHttp, path, target, activo });
    
    res.status(201).json({ endpointId: out.endpointId, message: 'Endpoint de API creado exitosamente.' });
  
  } catch (err) {
    console.error(err);
    const map = { 
      'SUBMODULE_NOT_FOUND': 404,
      'ENDPOINT_PATH_EXISTS': 409
    };
    res.status(map[err.message] || 500).json({ message: err.message });
  }
}

/**
 * Controlador que obtiene todos los endpoints de la base de datos y los envía en la respuesta.
 * @param {object} req - Objeto de la petición.
 * @param {object} res - Objeto de la respuesta.
 */
async function getAllEndpoints(req, res) {
    try {
        const endpoints = await endpointApiModel.getAllEndpoints();
        res.status(200).json(endpoints);
    } catch (err) {
        // En caso de error, respondemos con un error de servidor
        res.status(500).json({ error: 'Error al obtener los endpoints.' });
    }
}

async function allowedEndpoints(req, res) {
  const usuarioId    = parseInt(req.query.user, 10);
  const plataformaId = parseInt(req.query.plat, 10);

  if (isNaN(usuarioId) || isNaN(plataformaId)) {
    return res.status(400).json({ message: 'user y plat deben ser numéricos' });
  }

  try {
    const endpoints = await endpointApiModel.getAllowedEndpoints({ usuarioId, plataformaId });
    res.json({ usuarioId, plataformaId, total: endpoints.length, endpoints });
  } catch (err) {
    console.error(err);
    const map = {
      INVALID_PARAMS: 400
    };
    res.status(map[err.message] || 500).json({ message: 'Error al obtener endpoints' });
  }
}

module.exports = { createEndpointApi, getAllEndpoints, allowedEndpoints };