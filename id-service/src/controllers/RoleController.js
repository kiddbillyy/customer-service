const roleModel = require('../models/RoleModels');

function validarPermisos(permisos) {
  if (!Array.isArray(permisos) || !permisos.length) {
    return 'permisos debe ser un arreglo no vacío';
  }
  for (const p of permisos) {
    if (typeof p.subModuloId !== 'number' || !Array.isArray(p.accionesId) || !p.accionesId.length) {
      return `permiso mal formado. subModuloId debe ser un número y accionesId un arreglo no vacío`;
    }
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
    const opts = {
      name: req.query.name,
      creatorName: req.query.creatorName,
      creatorEmail: req.query.creatorEmail,
      createdFrom: req.query.createdFrom,
      createdTo: req.query.createdTo,
      updatedFrom: req.query.updatedFrom,
      updatedTo: req.query.updatedTo,
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 10
    };

    const roles = await roleModel.getAllRoles(opts);

    // Reestructurar cada rol
    const rolesTransformados = {
      page: roles.page,
      pageSize: roles.pageSize,
      totalRecords: roles.totalRecords,
      totalPages: roles.totalPages,
      data: roles.data.map(role => ({
        ID: role.ID,
        NOMBRE: role.NOMBRE,
        DESCRIPCION: role.DESCRIPCION,
        FECHA_CREACION: role.FECHA_CREACION,
        FECHA_ACTUALIZACION: role.FECHA_ACTUALIZACION,
        ACTIVO: role.ACTIVO,

        creador: {
          correo: role.CorreoCreador,
          nombre: role.NombreCreador,
          imagen: role.ImagenCreador
        },
        actualizador: {
          correo: role.CorreoActualizador,
          nombre: role.NombreActualizador,
          imagen: role.ImagenActualizador
        }
      }))
    };

    res.status(200).json(rolesTransformados);

  } catch (err) {
    console.error('Error al obtener los roles:', err);
    res.status(500).json({ message: 'Error al obtener los roles' });
  }
}



async function updateRole(req, res) {
    console.log('Params recibidos:', req.params);
    const roleId = parseInt(req.params.roleId, 10);
    console.log("roleId recibido:", roleId);
    const { nombre, descripcion, plataformaCod, permisos, usuarioId, activo } = req.body;
    console.log("Body recibido:", { nombre, descripcion, plataformaCod, permisos, usuarioId });

    if (isNaN(roleId)) {
        return res.status(400).json({ message: 'El ID del rol debe ser un número entero válido.' });
    }

    try {
        const out = await roleModel.updateRole({ roleId, nombre, descripcion, plataformaCod, permisos, usuarioId, activo: activo === undefined ? undefined : (activo ? 1 : 0) });
 
        res.status(200).json(out);
    } catch (err) {
        console.error("Error capturado en el controlador:", err);
        const map = { 
            'ROLE_NOT_FOUND': 404,
            'PLATFORM_NOT_FOUND': 404,
            'SUBMODULE_NOT_FOUND': 400,
            'ACTION_NOT_FOUND': 400
        };
        res.status(map[err.message.split(':')[0]] || 500).json({ message: err.message });
    }
}

/* async function getRolePermissions(req, res) {
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
 */
async function getRoleById(req, res) {
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) {
        return res.status(400).json({ message: 'El ID del rol debe ser un número entero válido.' });
    }
    try {
        const role = await roleModel.getRoleById(roleId);
        if (!role) {
            return res.status(404).json({ message: 'Rol no encontrado.' });
        }
        res.status(200).json(role);
    } catch (err) {
        console.error('Error en el controlador al obtener rol por ID:', err);
        res.status(500).json({ message: 'Error interno del servidor al obtener el rol.' });
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

async function listRoles(req, res) {
  try {
    const opts = {
      page     : parseInt(req.query.page ?? '1', 10),
      pageSize : parseInt(req.query.pageSize ?? '20', 10),
      sortBy   : req.query.sortBy,
      sortOrder: req.query.sortOrder,
      nombre   : req.query.nombre,
      status   : req.query.status,
      usuarioCreador      : req.query.usuarioCreador,
      usuarioActualizador : req.query.usuarioActualizador,
      fechaCreacionDesde      : req.query.fechaCreacionDesde,
      fechaCreacionHasta      : req.query.fechaCreacionHasta,
      fechaModificacionDesde  : req.query.fechaModificacionDesde,
      fechaModificacionHasta  : req.query.fechaModificacionHasta
    };

    const result = await roleModel.getRoles(opts);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener roles' });
  }
}

module.exports = { getStructure, createRole, getAllRoles, getRoleById, updateRole, addPermissionsToRole, listRoles};
