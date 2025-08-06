/* const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

/
 * Asigna permisos a un usuario.
 * Si replace = true, primero borra los permisos previos y luego inserta los nuevos.
 *
 * @param {number} usuarioId
 * @param {Array<{ subModuloId:number, accionesId:number[] }>} permisos
 * @param {boolean} replace    - opcional (default: false = solo agrega)
 * @param {number} userAdminId - quién realiza el cambio (para auditoría, si lo requieres)
 /
async function addOrReplaceUserPermissions({ usuarioId, permisos, replace = false, userAdminId }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
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

module.exports = { addOrReplaceUserPermissions };
 */



const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

/**
 * Upsert de permisos de un usuario.
 *
 * @param {number}  usuarioId
 * @param {Array<{ subModuloId:number, accionesId:number[], activo?:boolean }>} permisos
 * @param {boolean} replace     Si true, borra los permisos previos antes de upsert
 * @param {number}  userAdminId (opcional)
 */
async function addOrReplaceUserPermissions({ usuarioId, permisos, replace = false, userAdminId }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const usuarioExiste = (await tx.request()
      .input('uid', sql.Int, usuarioId)
      .query('SELECT 1 FROM Usuarios WHERE UsuarioID = @uid')
    ).recordset[0];
    if (!usuarioExiste) throw new Error('USER_NOT_FOUND');

    const flat = [];  // [{subModuloId, accionId, activo}]
    for (const p of permisos) {
      const subOk = (await tx.request()
        .input('sid', sql.Int, p.subModuloId)
        .query('SELECT 1 FROM SUBMODULOS WHERE ID = @sid')
      ).recordset[0];
      if (!subOk) throw new Error(`SUBMODULE_NOT_FOUND:${p.subModuloId}`);

      if (!Array.isArray(p.accionesId) || !p.accionesId.length) {
        throw new Error(`EMPTY_ACTIONS:${p.subModuloId}`);
      }

      for (const accionId of p.accionesId) {
        const accOk = (await tx.request()
          .input('aid', sql.Int, accionId)
          .query('SELECT 1 FROM TIPOS_ACCION WHERE ID = @aid')
        ).recordset[0];
        if (!accOk) throw new Error(`ACTION_NOT_FOUND:${accionId}`);

        flat.push({
          subModuloId: p.subModuloId,
          accionId,
          activo: p.activo === undefined ? 1 : (p.activo ? 1 : 0)
        });
      }
    }

    if (replace) {
      await tx.request()
        .input('uid', sql.Int, usuarioId)
        .query('DELETE FROM USUARIO_SUBMODULO_ACCION WHERE USUARIO_ID = @uid');
    }

    if (flat.length) {
      const values = flat.map(
        r => `(${usuarioId}, ${r.subModuloId}, ${r.accionId}, ${r.activo})`
      ).join(',');

      await tx.request().query(`
        MERGE USUARIO_SUBMODULO_ACCION AS T
        USING (VALUES ${values})
              AS S (USUARIO_ID, SUBMODULO_ID, ACCION_ID, ACTIVO)
        ON  T.USUARIO_ID   = S.USUARIO_ID
        AND T.SUBMODULO_ID = S.SUBMODULO_ID
        AND T.ACCION_ID    = S.ACCION_ID
        WHEN MATCHED THEN
             UPDATE SET ACTIVO = S.ACTIVO
        WHEN NOT MATCHED THEN
             INSERT (USUARIO_ID, SUBMODULO_ID, ACCION_ID, ACTIVO)
             VALUES (S.USUARIO_ID, S.SUBMODULO_ID, S.ACCION_ID, S.ACTIVO);
      `);
    }

    await tx.commit();
    return { message: 'Permisos procesados', totalPermisos: flat.length };

  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 *
 * @param {number} usuarioId
 * @returns {Promise<{usuarioId:number, permisos:Array}>}
 *          permisos = [
 *            { subModuloId, subModuloNombre, acciones:[{ id, nombre }] }
 *          ]
 */
async function getUserPermissions(usuarioId) {
  await IdServicePoolConnect;

  const u = await IdServicePool.request()
             .input('uid', sql.Int, usuarioId)
             .query('SELECT 1 FROM Usuarios WHERE UsuarioID = @uid');
  if (!u.recordset[0]) throw new Error('USER_NOT_FOUND');

  const { recordset } = await IdServicePool.request()
    .input('uid', sql.Int, usuarioId)
    .query(`
      SELECT
        usa.SUBMODULO_ID,
        sm.NOMBRE      AS SubModuloNombre,
        usa.ACCION_ID,
        ta.NOMBRE      AS AccionNombre
      FROM USUARIO_SUBMODULO_ACCION usa
      JOIN SUBMODULOS   sm ON sm.ID = usa.SUBMODULO_ID
      JOIN TIPOS_ACCION ta ON ta.ID = usa.ACCION_ID
      WHERE usa.USUARIO_ID = @uid
        AND usa.ACTIVO = 1
      ORDER BY sm.NOMBRE, ta.NOMBRE;
    `);

  const map = new Map();
  for (const row of recordset) {
    if (!map.has(row.SUBMODULO_ID)) {
      map.set(row.SUBMODULO_ID, {
        subModuloId    : row.SUBMODULO_ID,
        subModuloNombre: row.SubModuloNombre,
        acciones       : []
      });
    }
    map.get(row.SUBMODULO_ID).acciones.push({
      id    : row.ACCION_ID,
      nombre: row.AccionNombre
    });
  }

  return {
    usuarioId,
    permisos: Array.from(map.values())
  };
}

/**
 * Permisos efectivos (directos + por rol) de un usuario en una plataforma,
 * agrupados: Módulo → Submódulo → Acciones.
 *
 * @param {number} usuarioId
 * @param {number} plataformaId
 * @returns Promise<{
 *   usuarioId: number,
 *   plataformaId: number,
 *   permisos: [{
 *     moduloId, moduloNombre,
 *     submodulos: [{
 *       subModuloId, subModuloNombre, subModuloRuta,
 *       acciones: [{ id, nombre }]
 *     }]
 *   }]
 * }>
 */
async function getUserPermissionsByPlatform(usuarioId, plataformaId) {
  await IdServicePoolConnect;

  /* ── validar usuario y plataforma ─────────────────────────────── */
  const [[uExists], [pExists]] = await Promise.all([
    IdServicePool.request()
      .input('uid', sql.Int, usuarioId)
      .query('SELECT 1 FROM Usuarios WHERE UsuarioID = @uid'),
    IdServicePool.request()
      .input('pid', sql.Int, plataformaId)
      .query('SELECT 1 FROM Plataformas WHERE ID = @pid')
  ]).then(r => r.map(x => x.recordset));

  if (!uExists) throw new Error('USER_NOT_FOUND');
  if (!pExists) throw new Error('PLATFORM_NOT_FOUND');

  const { recordset } = await IdServicePool.request()
    .input('uid', sql.Int, usuarioId)
    .input('pid', sql.Int, plataformaId)
    .query(`

      ;WITH RolesUsuario AS (
        SELECT ur.ROL_ID
        FROM   USUARIO_ROL        ur
        JOIN   USUARIO_PLATAFORMA up
               ON up.USUARIO_ID    = ur.USUARIO_ID
              AND up.ACTIVO         = 1
              AND up.PLATAFORMA_ID  = @pid
        WHERE  ur.USUARIO_ID = @uid
        AND  ur.ACTIVO     = 1
      ),

      PermisosPorRol AS (
        SELECT rsa.SUBMODULO_ID,
               rsa.ACCION_ID
        FROM   ROL_SUBMODULO_ACCION rsa
        JOIN   RolesUsuario         ru ON ru.ROL_ID = rsa.ROL_ID
        WHERE  rsa.ACTIVO = 1
      ),

      PermisosDirectos AS (
        SELECT SUBMODULO_ID,
               ACCION_ID
        FROM   USUARIO_SUBMODULO_ACCION
        WHERE  USUARIO_ID = @uid
          AND  ACTIVO     = 1
      )

      SELECT DISTINCT
             mp.ID    AS ModuloId,
             mp.NOMBRE AS ModuloNombre,
             mp.RUTA as ModuloRuta,
             sm.ID    AS SubModuloId,
             sm.NOMBRE AS SubModuloNombre,
             sm.RUTA   AS SubModuloRuta,
             p.ACCION_ID  AS AccionId,
             ta.NOMBRE    AS AccionNombre
      FROM (
        SELECT * FROM PermisosPorRol
        UNION ALL
        SELECT * FROM PermisosDirectos
      ) p
      JOIN SUBMODULOS         sm ON sm.ID = p.SUBMODULO_ID
      JOIN MODULOS_PLATAFORMA mp ON mp.ID = sm.MODULO_ID
                                AND mp.PLATAFORMA_ID = @pid
      JOIN TIPOS_ACCION       ta ON ta.ID = p.ACCION_ID
      ORDER BY mp.NOMBRE, sm.NOMBRE, ta.NOMBRE;
    `);

  const moduloMap = new Map();
  for (const row of recordset) {
    if (!moduloMap.has(row.ModuloId)) {
      moduloMap.set(row.ModuloId, {
        moduloId    : row.ModuloId,
        moduloNombre: row.ModuloNombre,
        moduloRuta: row.ModuloRuta,
        submodulos  : new Map()
      });
    }
    const modulo = moduloMap.get(row.ModuloId);
    if (!modulo.submodulos.has(row.SubModuloId)) {
      modulo.submodulos.set(row.SubModuloId, {
        subModuloId    : row.SubModuloId,
        subModuloNombre: row.SubModuloNombre,
        subModuloRuta  : row.SubModuloRuta,
        acciones       : []
      });
    }
    const sub = modulo.submodulos.get(row.SubModuloId);

    if (!sub.acciones.some(a => a.id === row.AccionId)) {
      sub.acciones.push({ id: row.AccionId, nombre: row.AccionNombre });
    }
  }

  const permisos = Array.from(moduloMap.values()).map(m => ({
    moduloId    : m.moduloId,
    moduloNombre: m.moduloNombre,
    moduloRuta  : m.moduloRuta,
    submodulos  : Array.from(m.submodulos.values())
  }));

  return { usuarioId, plataformaId, permisos };
}


module.exports = { addOrReplaceUserPermissions, getUserPermissions, getUserPermissionsByPlatform };
