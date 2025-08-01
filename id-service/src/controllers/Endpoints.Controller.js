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

module.exports = { createEndpointApi };