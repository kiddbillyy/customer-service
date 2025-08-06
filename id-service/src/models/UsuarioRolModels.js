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
      .query(`SELECT UsuarioID FROM Usuarios WHERE UsuarioID = @uId`)
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


/**
 * Activa o desactiva un rol ya asignado a un usuario.
 *
 * @param {number} usuarioId
 * @param {number} rolId
 * @param {boolean} activo            // true = 1, false = 0
 * @returns {Promise<{ message:string }>}
 */
async function updateUsuarioRolActivo({ usuarioId, rolId, activo }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    /* validar que exista la fila */
    const fila = (await tx.request()
      .input('uid', sql.Int, usuarioId)
      .input('rid', sql.Int, rolId)
      .query('SELECT ID, ACTIVO FROM USUARIO_ROL WHERE USUARIO_ID=@uid AND ROL_ID=@rid')
    ).recordset[0];

    if (!fila)        throw new Error('ASSIGNMENT_NOT_FOUND');
    if (fila.ACTIVO === (activo ? 1 : 0))
      throw new Error('NO_CHANGE_NEEDED');

    await tx.request()
      .input('id',  sql.Int, fila.ID)
      .input('act', sql.Bit, activo ? 1 : 0)
      .query('UPDATE USUARIO_ROL SET ACTIVO=@act WHERE ID=@id');

    await tx.commit();
    return { message: 'Estado actualizado' };

  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { createUsuarioRol, updateUsuarioRolActivo };