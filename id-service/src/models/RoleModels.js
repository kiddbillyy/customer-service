 // models/RolesModel.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

async function getPlatformStructure(plataformaCod) {
  await IdServicePoolConnect;

  const req   = IdServicePool.request();
  console.log("Request pool: ",req)

  const { recordset } = await IdServicePool.request()
    .input('plat', sql.NVarChar(50), plataformaCod)
    .query(`
      SELECT
        mp.ID           AS ModuloID,
        mp.NOMBRE       AS ModuloNombre,
        mp.CODIGO       AS ModuloCodigo,
        sm.ID           AS SubModuloID,
        sm.NOMBRE       AS SubModuloNombre,
        sm.CODIGO       AS SubModuloCodigo,
        ta.ID           AS AccionID,
        ta.NOMBRE       AS AccionNombre,
        ta.CODIGO       AS AccionCodigo
      FROM      PLATAFORMAS p
      JOIN      MODULOS_PLATAFORMA mp ON mp.PLATAFORMA_ID = p.ID
      LEFT JOIN SUBMODULOS sm          ON sm.MODULO_ID     = mp.ID
      CROSS     JOIN TIPOS_ACCION ta
      WHERE     p.CODIGO = @plat
      ORDER     BY mp.ID, sm.ID, ta.ID
    `);
  const out = [];
  for (const row of recordset) {
    let modulo = out.find(m => m.id === row.ModuloID);
    if (!modulo) {
      modulo = { id: row.ModuloID, codigo: row.ModuloCodigo, nombre: row.ModuloNombre, submodulos: [] };
      out.push(modulo);
    }
    if (row.SubModuloID) {
      let sub = modulo.submodulos.find(s => s.id === row.SubModuloID);
      if (!sub) {
        sub = { id: row.SubModuloID, codigo: row.SubModuloCodigo, nombre: row.SubModuloNombre, acciones: [] };
        modulo.submodulos.push(sub);
      }
      sub.acciones.push({ id: row.AccionID, codigo: row.AccionCodigo, nombre: row.AccionNombre });
    }
  }
  return out;
}

async function createRole({ nombre, descripcion, plataformaCod, permisos, usuarioId }) { // <-- Añadir usuarioId
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const platId = (await tx.request()
      .input('p', sql.NVarChar(50), plataformaCod)
      .query(`SELECT ID FROM PLATAFORMAS WHERE CODIGO=@p`)
    ).recordset[0]?.ID;
    if (!platId) throw new Error('PLATFORM_NOT_FOUND');

    const roleResult = await tx.request()
      .input('n', sql.NVarChar(50),  nombre)
      .input('d', sql.NVarChar(255), descripcion)
      .input('uId', sql.Int, usuarioId)
      .query(`
        INSERT INTO ROLES (NOMBRE, DESCRIPCION, UsuarioCreador, UsuarioActualizador, ACTIVO)
        OUTPUT INSERTED.ID
        VALUES (@n, @d, @uId, @uId, 1);
      `);

    const newRoleId = roleResult.recordset[0].ID;

    const req = tx.request();
    const rows = permisos.flatMap((p, i) =>
      p.acciones.map((ac, j) => ({
        subModuloCod: p.subModuloCod,
        accionCod: ac,
        idx: i * 10 + j
      }))
    );
    rows.forEach(r => {
      req.input(`sub${r.idx}`, sql.NVarChar(50), r.subModuloCod);
      req.input(`ac${r.idx}`,  sql.NVarChar(20), r.accionCod);
    });

    const values = rows.map(r => `
      (
        ${newRoleId},
        (SELECT sm.ID FROM SUBMODULOS sm WHERE sm.CODIGO=@sub${r.idx}),
        (SELECT ta.ID FROM TIPOS_ACCION ta WHERE ta.CODIGO=@ac${r.idx}),
        1 
      )
    `).join(',');

    await req.query(`
      INSERT INTO ROL_SUBMODULO_ACCION (ROL_ID, SUBMODULO_ID, ACCION_ID, ACTIVO)
      VALUES ${values};
    `);

    await tx.commit();
    return { roleId: newRoleId };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}


/**
 * Obtiene todos los roles de la base de datos.
 * @returns {Promise<Array>} Un array de objetos con los roles.
 */
async function getAllRoles() {
await IdServicePoolConnect;

 try {
  const { recordset } = await IdServicePool.request()
      .query(`
        SELECT
          r.ID,
          r.NOMBRE,
          r.DESCRIPCION,
          r.FECHA_CREACION,
          r.FECHA_ACTUALIZACION,
          r.ACTIVO,
          uc_perfil.Nombres AS UsuarioCreadorNombre,
          ua_perfil.Nombres AS UsuarioActualizadorNombre
        FROM ROLES AS r
        LEFT JOIN Perfiles AS uc_perfil ON r.UsuarioCreador = uc_perfil.UsuarioID
        LEFT JOIN Perfiles AS ua_perfil ON r.UsuarioActualizador = ua_perfil.UsuarioID
        ORDER BY r.NOMBRE;
      `);
    
    return recordset;

  } catch (err) {
    console.error("Error fetching all roles:", err);
    throw err;
  }
}


async function getRolePermissions(roleId) {
  await IdServicePoolConnect;

  try {
    const { recordset } = await IdServicePool.request()
      .input('id', sql.Int, roleId)
      .query(`
        SELECT 
          sm.CODIGO AS subModuloCod,
          ta.CODIGO AS accionCod,
          ta.ID as accionID
        FROM ROL_SUBMODULO_ACCION rsa
        JOIN SUBMODULOS sm     ON rsa.SUBMODULO_ID = sm.ID
        JOIN TIPOS_ACCION ta   ON rsa.ACCION_ID    = ta.ID
        WHERE rsa.ROL_ID = @id AND rsa.ACTIVO = 1
      `);
    const permisosPorSubModulo = {};

    for (const row of recordset) {
      if (!permisosPorSubModulo[row.subModuloCod]) {
        permisosPorSubModulo[row.subModuloCod] = [];
      }
      permisosPorSubModulo[row.subModuloCod].push({
        id: row.accionID,
        codigo: row.accionCod
      });
    }

    return Object.entries(permisosPorSubModulo).map(([subModuloCod, acciones]) => ({
      subModuloCod,
      acciones
    }));

  } catch (err) {
    console.error("Error al obtener permisos del rol:", err);
    throw err;
  }
}



async function addPermissionsToRole({ roleId, permisos }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const req = tx.request();

    const rows = permisos.flatMap((p, i) =>
      p.acciones.map((accionId, j) => ({
        subModuloId: p.subModuloId,
        accionId,
        idx: i * 10 + j
      }))
    );

    rows.forEach(r => {
      req.input(`sub${r.idx}`, sql.Int, r.subModuloId);
      req.input(`ac${r.idx}`,  sql.Int, r.accionId);
    });

    const values = rows.map(r => `
      SELECT
        ${roleId} AS ROL_ID,
        @sub${r.idx} AS SUBMODULO_ID,
        @ac${r.idx} AS ACCION_ID,
        1 AS ACTIVO
      WHERE NOT EXISTS (
        SELECT 1 FROM ROL_SUBMODULO_ACCION rsa
        WHERE rsa.ROL_ID = ${roleId}
          AND rsa.SUBMODULO_ID = @sub${r.idx}
          AND rsa.ACCION_ID = @ac${r.idx}
      )
    `).join(`\nUNION ALL\n`);

    if (values.length > 0) {
      await req.query(`
        INSERT INTO ROL_SUBMODULO_ACCION (ROL_ID, SUBMODULO_ID, ACCION_ID, ACTIVO)
        ${values};
      `);
    }

    await tx.commit();
    return { message: 'Permisos agregados exitosamente' };

  } catch (err) {
    await tx.rollback();
    console.error("Error al agregar permisos al rol:", err);
    throw err;
  }
}




module.exports = { getPlatformStructure, createRole, getAllRoles, getRolePermissions,addPermissionsToRole};
