const userModel = require('../models/UserPermissionsModel');

/**
 * PATCH /users/:userId/permissions
 * Body:
 *   {
 *     "permisos": [
 *       { "subModuloId": 3, "accionesId": [1,2] },
 *       { "subModuloId": 5, "accionesId": [1] }
 *     ],
 *     "replace": true,        // opcional: borra anteriores
 *     "adminId": 99           // opcional: quién hace el cambio
 *   }
 */
async function updateUserPermissions(req, res) {
  const usuarioId = parseInt(req.params.userId, 10);
  if (isNaN(usuarioId)) {
    return res.status(400).json({ message: 'userId debe ser numérico' });
  }

  const { permisos, replace, adminId } = req.body;
  if (!Array.isArray(permisos) || !permisos.length) {
    return res.status(400).json({ message: 'permisos debe ser un arreglo no vacío' });
  }
  try {
    const out = await userModel.addOrReplaceUserPermissions({
      usuarioId,
      permisos,
      replace: !!replace,
      userAdminId: adminId
    });
    res.json(out);
  } catch (err) {
    const map = {
      USER_NOT_FOUND: 404,
      // resto mapeo 400
    };
    const key = err.message.split(':')[0];
    res.status(map[key] || 500).json({ message: err.message });
  }
}

/*  GET /users/:userId/permissions */

async function getUserPermissions(req, res) {
  const usuarioId = parseInt(req.params.userId, 10);
  if (isNaN(usuarioId)) {
    return res.status(400).json({ message: 'userId debe ser numérico' });
  }

  try {
    const data = await userModel.getUserPermissions(usuarioId);
    res.json(data);
  } catch (err) {
    const map = { USER_NOT_FOUND: 404 };
    res.status(map[err.message] || 500).json({ message: err.message });
  }
}



/**
 * GET /users/:userId/permissions/:platformId
 * Devuelve permisos (directos + roles) del usuario en la plataforma.
 */
async function getUserPermissionsByPlatform(req, res) {
  const usuarioId    = parseInt(req.params.userId, 10);
  const plataformaId = parseInt(req.params.platformId, 10);

  if (isNaN(usuarioId) || isNaN(plataformaId)) {
    return res.status(400).json({ message: 'IDs deben ser numéricos' });
  }

  try {
    const data = await userModel.getUserPermissionsByPlatform(usuarioId, plataformaId);
    res.json(data);
  } catch (err) {
    const map = {
      USER_NOT_FOUND     : 404,
      PLATFORM_NOT_FOUND : 404
    };
    const key = err.message.split(':')[0];
    res.status(map[key] || 500).json({ message: err.message });
  }
}



module.exports = { updateUserPermissions, getUserPermissions, getUserPermissionsByPlatform};
