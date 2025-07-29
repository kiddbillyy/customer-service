// controllers/RolesController.js
const roleModel = require('../models/RoleModels');

function validarPermisos(permisos) {
  if (!Array.isArray(permisos) || !permisos.length) return 'permisos debe ser arreglo no vacío';
  for (const p of permisos) {
    if (!p.subModuloCod || !Array.isArray(p.acciones)) return 'permiso mal formado';
  }
  return null;
}

// GET /roles/estructura/:platCod
async function getStructure(req, res) {
  try {
    const data = await roleModel.getPlatformStructure(req.params.platCod);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener estructura' });
  }
}

// POST /roles
async function createRole(req, res) {
  const { nombre, descripcion, plataformaCod, permisos } = req.body;
  if (!nombre || !plataformaCod) return res.status(400).json({ message:'nombre y plataformaCod son requeridos' });
  const msg = validarPermisos(permisos);
  if (msg) return res.status(400).json({ message: msg });

  try {
    const out = await roleModel.createRole({ nombre, descripcion, plataformaCod, permisos });
    res.status(201).json({ roleId: out.roleId });
  } catch (err) {
    console.error(err);
    const map = { PLATFORM_NOT_FOUND: 404 };
    res.status(map[err.message] || 500).json({ message: err.message });
  }
}

module.exports = { getStructure, createRole };
