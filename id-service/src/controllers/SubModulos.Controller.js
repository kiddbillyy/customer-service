// controllers/SubModuloController.js
const subModuloModel = require('../models/SubModulosModels');

async function createSubModulo(req, res) {
  const { moduloId, nombre, codigo, descripcion, ruta } = req.body;

  if (!moduloId || !nombre || !codigo || !ruta) {
    return res.status(400).json({ message: 'moduloId, nombre, codigo y ruta son requeridos.' });
  }

  try {
    const out = await subModuloModel.createSubModulo({ moduloId, nombre, codigo, descripcion, ruta });
    res.status(201).json({ subModuloId: out.subModuloId, message: 'Submódulo creado exitosamente.' });
  } catch (err) {
    console.error(err);
    const map = { 
      'MODULE_NOT_FOUND': 404,
      'SUBMODULE_CODE_EXISTS': 409
    };
    res.status(map[err.message] || 500).json({ message: err.message });
  }
}

module.exports = { createSubModulo };