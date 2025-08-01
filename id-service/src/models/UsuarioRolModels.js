// models/UsuarioRolModel.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

/**
 * Asigna un rol a un usuario.
 * @param {object} usuarioRolData - Datos de la asignación de rol.
 * @param {number} usuarioRolData.usuarioId - ID del usuario.
 * @param {number} usuarioRolData.rolId - ID del rol a asignar.
 * @returns {Promise<object>} Objeto con el ID de la asignación creada.
 */
async function createUsuarioRol({ usuarioId, rolId }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const usuarioExist = (await tx.request()
      .input('uId', sql.Int, usuarioId)
      .query(`SELECT ID FROM Usuarios WHERE ID = @uId`)
    ).recordset[0];
    if (!usuarioExist) {
      throw new Error('USER_NOT_FOUND');
    }

    const rolExist = (await tx.request()
      .input('rId', sql.Int, rolId)
      .query(`SELECT ID FROM Roles WHERE ID = @rId`)
    ).recordset[0];
    if (!rolExist) {
      throw new Error('ROLE_NOT_FOUND');
    }

    const assignmentExist = (await tx.request()
      .input('uId', sql.Int, usuarioId)
      .input('rId', sql.Int, rolId)
      .query(`SELECT ID FROM USUARIO_ROL WHERE USUARIO_ID = @uId AND ROL_ID = @rId`)
    ).recordset[0];
    if (assignmentExist) {
      throw new Error('ASSIGNMENT_ALREADY_EXISTS');
    }

    const result = await tx.request()
      .input('uId', sql.Int, usuarioId)
      .input('rId', sql.Int, rolId)
      .query(`
        INSERT INTO USUARIO_ROL (USUARIO_ID, ROL_ID)
        OUTPUT INSERTED.ID
        VALUES (@uId, @rId);
      `);

    const newAssignmentId = result.recordset[0].ID;

    await tx.commit();
    return { usuarioRolId: newAssignmentId };

  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { createUsuarioRol };