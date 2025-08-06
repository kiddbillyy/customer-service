// models/RolesModel.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

async function getPlatformStructure(plataformaCod) {
  await IdServicePoolConnect;

  const req = IdServicePool.request();
  console.log("Request pool: ", req)

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


    const permisosAplanados = [];
    for (const p of permisos) {
      const subModulo = (await tx.request()
        .input('subId', sql.Int, p.subModuloId)
        .input('platId', sql.Int, platId)
        .query(`SELECT 1 FROM SUBMODULOS WHERE ID = @subId AND MODULO_ID IN (SELECT ID FROM MODULOS_PLATAFORMA WHERE PLATAFORMA_ID = @platId)`)
      ).recordset[0];
      if (!subModulo) throw new Error(`SUBMODULE_NOT_FOUND: ${p.subModuloId}`);

      if (!Array.isArray(p.accionesId) || p.accionesId.length === 0) {
        throw new Error(`Invalid permissions for submodule ${p.subModuloId}: 'accionesId' must be a non-empty array.`);
      }

      for (const accionId of p.accionesId) {
        const accion = (await tx.request()
          .input('accId', sql.Int, accionId)
          .query(`SELECT 1 FROM TIPOS_ACCION WHERE ID = @accId`)
        ).recordset[0];
        if (!accion) throw new Error(`ACTION_NOT_FOUND: ${accionId}`);

        permisosAplanados.push({ subModuloId: p.subModuloId, accionId });
      }
    }

    const roleResult = await tx.request()
      .input('n', sql.NVarChar(50), nombre)
      .input('d', sql.NVarChar(255), descripcion)
      .input('uId', sql.Int, usuarioId)
      .query(`
        INSERT INTO ROLES (NOMBRE, DESCRIPCION, UsuarioCreador, UsuarioActualizador, ACTIVO)
        OUTPUT INSERTED.ID
        VALUES (@n, @d, @uId, @uId, 1);
      `);

    const newRoleId = roleResult.recordset[0].ID;

    const values = permisosAplanados.map(p => `(${newRoleId}, ${p.subModuloId}, ${p.accionId}, 1)`).join(',');

    if (values.length > 0) {
      await tx.request().query(`
        INSERT INTO ROL_SUBMODULO_ACCION (ROL_ID, SUBMODULO_ID, ACCION_ID, ACTIVO)
        VALUES ${values};
      `);
    }

    await tx.commit();
    return { roleId: newRoleId };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function updateRole({ roleId, nombre, descripcion, plataformaCod, permisos, usuarioId, activo }) {
    await IdServicePoolConnect;
    const tx = new sql.Transaction(IdServicePool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
        console.log("Inicio de updateRole en el modelo para roleId:", roleId);
        const roleExists = (await tx.request()
            .input('rId', sql.Int, roleId)
            .query(`SELECT 1 FROM ROLES WHERE ID = @rId`)
        ).recordset[0];
        if (!roleExists) {
            throw new Error('ROLE_NOT_FOUND');
        }

        const platId = (await tx.request()
            .input('p', sql.NVarChar(50), plataformaCod)
            .query(`SELECT ID FROM PLATAFORMAS WHERE CODIGO=@p`)
        ).recordset[0]?.ID;
        if (!platId) {
            throw new Error('PLATFORM_NOT_FOUND');
        }

        const permisosAplanados = [];
        for (const p of permisos) {
            const subModulo = (await tx.request()
                .input('subId', sql.Int, p.subModuloId)
                .input('platId', sql.Int, platId)
                .query(`SELECT 1 FROM SUBMODULOS WHERE ID = @subId AND MODULO_ID IN (SELECT ID FROM MODULOS_PLATAFORMA WHERE PLATAFORMA_ID = @platId)`)
            ).recordset[0];
            if (!subModulo) {
                throw new Error(`SUBMODULE_NOT_FOUND: ${p.subModuloId}`);
            }
            if (!Array.isArray(p.accionesId) || p.accionesId.length === 0) {
                throw new Error(`Invalid permissions for submodule ${p.subModuloId}: 'accionesId' must be a non-empty array.`);
            }
            for (const accionId of p.accionesId) {
                const accion = (await tx.request()
                    .input('accId', sql.Int, accionId)
                    .query(`SELECT 1 FROM TIPOS_ACCION WHERE ID = @accId`)
                ).recordset[0];
                if (!accion) {
                    throw new Error(`ACTION_NOT_FOUND: ${accionId}`);
                }
                permisosAplanados.push({ subModuloId: p.subModuloId, accionId });
            }
        }
        
        await tx.request()
            .input('rId', sql.Int, roleId)
            .input('n', sql.NVarChar(50), nombre)
            .input('d', sql.NVarChar(255), descripcion)
            .input('uId', sql.Int, usuarioId)
            .input('activo', sql.Bit, activo)  
            .query(`
                UPDATE ROLES 
                SET NOMBRE = @n, DESCRIPCION = @d, UsuarioActualizador = @uId, FECHA_ACTUALIZACION = GETDATE(), ACTIVO = COALESCE(@activo, ACTIVO)
                WHERE ID = @rId;
            `);

        await tx.request()
            .input('rId', sql.Int, roleId)
            .query(`DELETE FROM ROL_SUBMODULO_ACCION WHERE ROL_ID = @rId;`);

        if (permisosAplanados.length > 0) {
            const values = permisosAplanados.map(p => `(${roleId}, ${p.subModuloId}, ${p.accionId}, 1)`).join(',');
            await tx.request().query(`
                INSERT INTO ROL_SUBMODULO_ACCION (ROL_ID, SUBMODULO_ID, ACCION_ID, ACTIVO)
                VALUES ${values};
            `);
        }

        await tx.commit();
        console.log("Transacción de updateRole exitosa.");
        return { message: `Rol ${roleId} actualizado exitosamente.` };

    } catch (err) {
        await tx.rollback();
        console.error("Error dentro de updateRole en el modelo:", err);
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

/* 
async function getRolePermissions(roleId) {
  await IdServicePoolConnect;

  try {
    const { recordset } = await IdServicePool.request()
      .input('id', sql.Int, roleId)
      .query(`
        SELECT
              sm.CODIGO AS subModuloCod,
              sm.MODULO_ID AS moduloID,
              ta.CODIGO AS accionCod,
              ta.ID AS accionID,
              rs.nombre AS NOMBRE,
              rs.DESCRIPCION as DESCRIPCION
          FROM
              ROL_SUBMODULO_ACCION rsa
          JOIN
              ROLES rs ON rsa.ROL_ID = rs.ID
          JOIN
              SUBMODULOS sm ON rsa.SUBMODULO_ID = sm.ID
          JOIN
              TIPOS_ACCION ta ON rsa.ACCION_ID = ta.ID
          WHERE
      `);
    const permisosPorSubModulo = new Map();

    for (const row of recordset) {
      const key = `${row.moduloID}|${row.subModuloCod}`;
      if (!permisosPorSubModulo.has(key)) {
        permisosPorSubModulo.set(key, {
          moduloID: row.moduloID,
          subModuloCod: row.subModuloCod,
          acciones: []
        });
      }
      permisosPorSubModulo.get(key).acciones.push({
        id: row.accionID,
        codigo: row.accionCod
      });
    }

    return Array.from(permisosPorSubModulo.values());

  } catch (err) {
    console.error("Error al obtener permisos del rol:", err);
    throw err;
  }
} */

// models/RolesModel.js

async function getRoleById(roleId) {
    await IdServicePoolConnect;
    try {
        // Obtenemos todos los datos relevantes en una sola consulta
        const { recordset } = await IdServicePool.request()
            .input('id', sql.Int, roleId)
            .query(`
                SELECT
                    r.ID AS roleId,
                    r.NOMBRE AS nombre,
                    r.DESCRIPCION AS descripcion,
                    r.UsuarioCreador AS usuarioId,
                    p.CODIGO AS plataformaCod,
                    sm.ID AS subModuloId,
                    ta.ID AS accionId
                FROM
                    ROLES r
                LEFT JOIN
                    ROL_SUBMODULO_ACCION rsa ON rsa.ROL_ID = r.ID
                LEFT JOIN
                    SUBMODULOS sm ON rsa.SUBMODULO_ID = sm.ID
                LEFT JOIN
                    MODULOS_PLATAFORMA mp ON sm.MODULO_ID = mp.ID
                LEFT JOIN
                    PLATAFORMAS p ON mp.PLATAFORMA_ID = p.ID
                LEFT JOIN
                    TIPOS_ACCION ta ON rsa.ACCION_ID = ta.ID
                WHERE
                    r.ID = @id
                ORDER BY
                    sm.ID, ta.ID;
            `);

        if (recordset.length === 0) {
            return null; // El rol no fue encontrado
        }

        // Extraer los datos del rol del primer registro
        const role = {
            roleId: recordset[0].roleId,
            nombre: recordset[0].nombre,
            descripcion: recordset[0].descripcion,
            plataformaCod: recordset[0].plataformaCod,
            usuarioId: recordset[0].usuarioId,
            permisos: []
        };
        
        // Agrupar los permisos
        const permisosPorSubModulo = new Map();
        for (const row of recordset) {
            // Manejar el caso donde el rol no tiene permisos
            if (!row.subModuloId) continue;
            
            if (!permisosPorSubModulo.has(row.subModuloId)) {
                permisosPorSubModulo.set(row.subModuloId, {
                    subModuloId: row.subModuloId,
                    accionesId: []
                });
            }
            permisosPorSubModulo.get(row.subModuloId).accionesId.push(row.accionId);
        }

        role.permisos = Array.from(permisosPorSubModulo.values());

        return role;

    } catch (err) {
        console.error("Error al obtener los datos del rol por ID:", err);
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
      req.input(`ac${r.idx}`, sql.Int, r.accionId);
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

const VALID_SORT = [
  'Nombre',
  'FechaCreacion',
  'FechaActualizacion',
  'CreadorNombre',
  'ActualizadorNombre',
  'Status'
];

/**
 * Listado paginado / filtrado de roles (JOIN con tabla Perfiles para los nombres).
 *
 * @param {object} opts
 *   page, pageSize, sortBy, sortOrder,
 *   nombre, usuarioCreador, usuarioActualizador,       // ← filtran por Nombres
 *   status ('Activo'|'Inactivo'),
 *   fechaCreacionDesde/Hasta, fechaModificacionDesde/Hasta
 */
async function getRoles(opts) {
  await IdServicePoolConnect;

  const where = [];
  const req   = IdServicePool.request();

  /* ------------------------------ filtros --------------------------------- */
  if (opts.nombre) {
    where.push('r.NOMBRE LIKE @nombre');
    req.input('nombre', sql.NVarChar(50), `%${opts.nombre}%`);
  }
  if (opts.status) {
    where.push('r.ACTIVO = @activo');
    req.input('activo', sql.Bit, opts.status.toLowerCase() === 'activo' ? 1 : 0);
  }
  if (opts.usuarioCreador) {
    where.push('uc.Nombres LIKE @ucreador');
    req.input('ucreador', sql.NVarChar(100), `%${opts.usuarioCreador}%`);
  }
  if (opts.usuarioActualizador) {
    where.push('ua.Nombres LIKE @uact');
    req.input('uact', sql.NVarChar(100), `%${opts.usuarioActualizador}%`);
  }

  if (opts.fechaCreacionDesde) {
    where.push('r.FECHA_CREACION >= @fcDesde');
    req.input('fcDesde', sql.DateTime, opts.fechaCreacionDesde);
  }
  if (opts.fechaCreacionHasta) {
    where.push('r.FECHA_CREACION <= @fcHasta');
    req.input('fcHasta', sql.DateTime, opts.fechaCreacionHasta);
  }
  if (opts.fechaModificacionDesde) {
    where.push('r.FECHA_ACTUALIZACION >= @fmDesde');
    req.input('fmDesde', sql.DateTime, opts.fechaModificacionDesde);
  }
  if (opts.fechaModificacionHasta) {
    where.push('r.FECHA_ACTUALIZACION <= @fmHasta');
    req.input('fmHasta', sql.DateTime, opts.fechaModificacionHasta);
  }

  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const sortBy    = VALID_SORT.includes(opts.sortBy) ? opts.sortBy : 'Nombre';
  const sortOrder = (opts.sortOrder || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const sqlText = `
    WITH Q AS (
      SELECT
        r.ID,
        r.NOMBRE              AS Nombre,
        r.DESCRIPCION         AS Descripcion,
        r.FECHA_CREACION      AS FechaCreacion,
        r.FECHA_ACTUALIZACION AS FechaActualizacion,
        CASE r.ACTIVO WHEN 1 THEN 'Activo' ELSE 'Inactivo' END AS Status,
        uc.Nombres  AS CreadorNombre,
        ua.Nombres  AS ActualizadorNombre,
        COUNT(*) OVER() AS totalRecords
      FROM ROLES r
      LEFT JOIN Perfiles uc ON uc.UsuarioID = r.UsuarioCreador
      LEFT JOIN Perfiles ua ON ua.UsuarioID = r.UsuarioActualizador
      ${whereSQL}
    )
    SELECT *
    FROM   Q
    ORDER  BY ${sortBy} ${sortOrder}
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY;
  `;

  req.input('offset',   sql.Int, (opts.page - 1) * opts.pageSize);
  req.input('pageSize', sql.Int, opts.pageSize);

  const { recordset } = await req.query(sqlText);
  const totalRecords  = recordset[0]?.totalRecords ?? 0;

  return {
    page        : opts.page,
    pageSize    : opts.pageSize,
    totalRecords,
    totalPages  : Math.ceil(totalRecords / opts.pageSize),
    data        : recordset.map(({ totalRecords, ...row }) => row)
  };
}


module.exports = { getPlatformStructure, createRole, getAllRoles,getRoleById , updateRole, addPermissionsToRole, getRoles  };
