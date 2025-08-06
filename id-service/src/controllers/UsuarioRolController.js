// controllers/UsuarioRolController.js
const usuarioRolModel = require('../models/UsuarioRolModels');

async function createUsuarioRol(req, res) {
  const { usuarioId, rolId } = req.body;
  if (!usuarioId || !rolId) {
    return res.status(400).json({ message: 'usuarioId y rolId son requeridos.' });
  }
  try {
    const out = await usuarioRolModel.createUsuarioRol({ usuarioId, rolId });
    res.status(201).json({ usuarioRolId: out.usuarioRolId, message: 'Rol asignado al usuario exitosamente.' });
  } catch (err) {
    console.error(err);
    const map = { 
      'USER_NOT_FOUND': 404,
      'ROLE_NOT_FOUND': 404,
      'ASSIGNMENT_ALREADY_EXISTS': 409
    };
    res.status(map[err.message] || 500).json({ message: err.message });
  }
}

/**
 * PATCH /users/:userId/roles/:roleId
 * Body: { "activo": true|false }
 */
async function toggleUsuarioRol(req, res) {
  const usuarioId = parseInt(req.params.userId, 10);
  const rolId     = parseInt(req.params.roleId, 10);
  const { activo } = req.body;

  if ([usuarioId, rolId].some(isNaN) || typeof activo !== 'boolean') {
    return res.status(400).json({ message: 'Parámetros inválidos' });
  }

  try {
    const out = await usuarioRolModel.updateUsuarioRolActivo({ usuarioId, rolId, activo });
    res.json(out);
  } catch (err) {
    const map = {
      USER_NOT_FOUND        : 404,
      ROLE_NOT_FOUND        : 404,
      ASSIGNMENT_NOT_FOUND  : 404,
      NO_CHANGE_NEEDED      : 200   // idempotente
    };
    res.status(map[err.message] || 500).json({ message: err.message });
  }
}

module.exports = { createUsuarioRol, toggleUsuarioRol };