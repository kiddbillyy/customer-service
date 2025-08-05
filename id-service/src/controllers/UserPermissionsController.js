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

module.exports = { updateUserPermissions /* + otros handlers */ };
