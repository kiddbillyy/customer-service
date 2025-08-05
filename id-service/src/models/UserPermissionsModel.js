const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

/**
 * Asigna permisos a un usuario.
 * Si replace = true, primero borra los permisos previos y luego inserta los nuevos.
 *
 * @param {number} usuarioId
 * @param {Array<{ subModuloId:number, accionesId:number[] }>} permisos
 * @param {boolean} replace    - opcional (default: false = solo agrega)
 * @param {number} userAdminId - quién realiza el cambio (para auditoría, si lo requieres)
 */
async function addOrReplaceUserPermissions({ usuarioId, permisos, replace = false, userAdminId }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    /* ----------- Validar usuario ------------- */
    const usuarioExiste = (await tx.request()
      .input('uid', sql.Int, usuarioId)
      .query('SELECT 1 FROM Usuarios WHERE UsuarioID = @uid')
    ).recordset[0];
    if (!usuarioExiste) throw new Error('USER_NOT_FOUND');

    const flat = []; 
    for (const p of permisos) {
      const subOk = (await tx.request()
        .input('sid', sql.Int, p.subModuloId)
        .query('SELECT 1 FROM SUBMODULOS WHERE ID = @sid')
      ).recordset[0];
      if (!subOk) throw new Error(`SUBMODULE_NOT_FOUND:${p.subModuloId}`);

      if (!Array.isArray(p.accionesId) || p.accionesId.length === 0) {
        throw new Error(`EMPTY_ACTIONS:${p.subModuloId}`);
      }

      for (const accionId of p.accionesId) {
        const accOk = (await tx.request()
          .input('aid', sql.Int, accionId)
          .query('SELECT 1 FROM TIPOS_ACCION WHERE ID = @aid')
        ).recordset[0];
        if (!accOk) throw new Error(`ACTION_NOT_FOUND:${accionId}`);

        flat.push({ subModuloId: p.subModuloId, accionId });
      }
    }

    if (replace) {
      await tx.request()
        .input('uid', sql.Int, usuarioId)
        .query('DELETE FROM USUARIO_SUBMODULO_ACCION WHERE USUARIO_ID = @uid');
    }

    if (flat.length) {
      const values = flat.map(
        p => `(${usuarioId}, ${p.subModuloId}, ${p.accionId}, 1)`
      ).join(',');
      await tx.request().query(`
        INSERT INTO USUARIO_SUBMODULO_ACCION (USUARIO_ID, SUBMODULO_ID, ACCION_ID, ACTIVO)
        SELECT x.* FROM (VALUES ${values}) x(USUARIO_ID,SUBMODULO_ID,ACCION_ID,ACTIVO)
        WHERE NOT EXISTS (
          SELECT 1
          FROM USUARIO_SUBMODULO_ACCION ua
          WHERE ua.USUARIO_ID = x.USUARIO_ID
            AND ua.SUBMODULO_ID = x.SUBMODULO_ID
            AND ua.ACCION_ID = x.ACCION_ID
        );
      `);
    }

    await tx.commit();
    return { message: 'Permisos actualizados', totalPermisos: flat.length };

  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { addOrReplaceUserPermissions /* plus other exports */ };
