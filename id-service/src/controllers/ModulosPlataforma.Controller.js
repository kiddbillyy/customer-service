// controllers/ModulosPlataforma.Controller.js
const moduloPlataformaModel = require('../models/ModulosPlataformaModels');

async function createModuloPlataforma(req, res) {
  const { plataformaId, nombre, codigo, ruta } = req.body;

  if (!plataformaId || !nombre || !codigo) {
    return res.status(400).json({ message: 'plataformaId, nombre y codigo son requeridos.' });
  }

  try {
    const out = await moduloPlataformaModel.createModuloPlataforma({ plataformaId, nombre, codigo, ruta });
    
    res.status(201).json({ moduloPlataformaId: out.moduloPlataformaId, message: 'Módulo de plataforma creado exitosamente.' });
  
  } catch (err) {
    console.error(err);
    const map = { 
      'PLATFORM_NOT_FOUND': 404,
      'MODULE_CODE_EXISTS': 409 
    };
    res.status(map[err.message] || 500).json({ message: err.message });
  }
}

module.exports = { createModuloPlataforma };