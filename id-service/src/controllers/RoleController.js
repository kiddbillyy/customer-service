// controllers/RolesController.js
const roleModel = require('../models/RoleModels');

function validarPermisos(permisos) {
  if (!Array.isArray(permisos) || !permisos.length) return 'permisos debe ser arreglo no vacío';
  for (const p of permisos) {
    if (!p.subModuloCod || !Array.isArray(p.acciones)) return 'permiso mal formado';
  }
  return null;
}

function validarPermisosPorId(permisos) {
  if (!Array.isArray(permisos) || !permisos.length) return 'permisos debe ser arreglo no vacío';
  for (const p of permisos) {
    if (
      typeof p.subModuloId !== 'number' ||
      !Array.isArray(p.acciones) ||
      p.acciones.length === 0 ||
      p.acciones.some(id => typeof id !== 'number')
    ) {
      return 'permiso mal formado: se espera subModuloId numérico y acciones como array de IDs numéricos no vacío';
    }
  }
  return null;
}


async function getStructure(req, res) {
  try {
    const data = await roleModel.getPlatformStructure(req.params.platCod);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener estructura' });
  }
}

async function createRole(req, res) {
  const { nombre, descripcion, plataformaCod, permisos, usuarioId } = req.body;
  if (!nombre || !plataformaCod || !usuarioId) {
    return res.status(400).json({ message:'nombre, plataformaCod y usuarioId son requeridos' });
  }
  const msg = validarPermisos(permisos);
  if (msg) return res.status(400).json({ message: msg });

  try {
    const out = await roleModel.createRole({ nombre, descripcion, plataformaCod, permisos, usuarioId }); // <-- Pasar usuarioId al modelo
    res.status(201).json({ roleId: out.roleId });
  } catch (err) {
    console.error(err);
    const map = { PLATFORM_NOT_FOUND: 404 };
    res.status(map[err.message] || 500).json({ message: err.message });
  }
}

async function getAllRoles(req, res) {
  try {
    const roles = await roleModel.getAllRoles();
    res.json(roles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener los roles' });
  }
}

async function getRolePermissions(req, res) {
  const roleId = parseInt(req.params.roleId);
  if (isNaN(roleId)) return res.status(400).json({ message: 'roleId inválido' });

  try {
    const permisos = await roleModel.getRolePermissions(roleId);
    res.json(permisos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener permisos del rol' });
  }
}


async function addPermissionsToRole(req, res) {
  const roleId = parseInt(req.params.roleId);
  if (isNaN(roleId)) return res.status(400).json({ message: 'roleId inválido' });

  const permisos = req.body.permisos;
  const msg = validarPermisosPorId(permisos);
  if (msg) return res.status(400).json({ message: msg });

  try {
    const result = await roleModel.addPermissionsToRole({ roleId, permisos });
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al agregar permisos al rol' });
  }
}

module.exports = { getStructure, createRole, getAllRoles, getRolePermissions, addPermissionsToRole };
