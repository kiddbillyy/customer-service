const { sql, IdServicePool } = require('../config/dbnew');

// Buscar usuario por correo
const obtenerUsuarioPorCorreo = async (correo) => {
  const pool = await IdServicePool.connect();
  const result = await pool.request()
    .input('correo', sql.NVarChar, correo)
    .query('SELECT * FROM Usuarios WHERE CorreoElectronico = @correo');
  return result.recordset[0];
};

// const insertarUsuario = async (
//   correo,
//   hashPassword,
//   activo,
//   usuarioCreadorId,
//   perfil = {},
//   rolId = null,
//   plataformaIds = []
// ) => {
//   const pool = await IdServicePool.connect();
//   const transaction = new sql.Transaction(pool);
//   await transaction.begin();

//   try {
//     const request = transaction.request();

//     request.input('correo', sql.NVarChar, correo);
//     request.input('hashPassword', sql.NVarChar, hashPassword);
//     request.input('activo', sql.Bit, activo);
//     request.input('usuarioCreador', sql.Int, usuarioCreadorId);

//     const usuarioResult = await request.query(`
//       INSERT INTO Usuarios (
//         CorreoElectronico,
//         HashPassword,
//         FechaCreacion,
//         FechaActualizacion,
//         Activo,
//         UsuarioCreador
//       )
//       VALUES (
//         @correo,
//         @hashPassword,
//         GETDATE(),
//         NULL,
//         @activo,
//         @usuarioCreador
//       );
//       SELECT SCOPE_IDENTITY() AS UsuarioID;
//     `);

//     const usuarioId = usuarioResult.recordset[0].UsuarioID;

//     const perfilRequest = transaction.request();
//     perfilRequest.input('UsuarioID', sql.Int, usuarioId);
//     perfilRequest.input('Nombres', sql.NVarChar(100), perfil.nombres ?? null);
//     perfilRequest.input('Apellidos', sql.NVarChar(100), perfil.apellidos ?? null);
//     perfilRequest.input('RUT', sql.NVarChar(20), perfil.rut ?? null);
//     perfilRequest.input('DepartamentoID', sql.Int, perfil.departamentoId ?? null);
//     perfilRequest.input('Telefono', sql.NVarChar(20), perfil.telefono ?? null);
//     perfilRequest.input('URLImagenPerfil', sql.NVarChar(255), perfil.urlImagenPerfil ?? null);
//     perfilRequest.input('CanalDeVenta', sql.NVarChar(100), perfil.canalDeVenta ?? null);
//     perfilRequest.input('CanalDeVentaId', sql.NVarChar(100), perfil.canalDeVentaId ?? null);

//     await perfilRequest.query(`
//       INSERT INTO Perfiles (
//         UsuarioID,
//         Nombres,
//         Apellidos,
//         RUT,
//         DepartamentoID,
//         Telefono,
//         URLImagenPerfil,
//         canalDeVenta,
//         canalDeVentaId
//       )
//       VALUES (
//         @UsuarioID,
//         @Nombres,
//         @Apellidos,
//         @RUT,
//         @DepartamentoID,
//         @Telefono,
//         @URLImagenPerfil,
//         @CanalDeVenta,
//         @CanalDeVentaId
//       );
//     `);

//     if (rolId !== null) {
//       const rolRequest = transaction.request();
//       rolRequest.input('UsuarioID', sql.Int, usuarioId);
//       rolRequest.input('RolID', sql.Int, rolId);

//       await rolRequest.query(`
//         INSERT INTO USUARIO_ROL (USUARIO_ID, ROL_ID)
//         VALUES (@UsuarioID, @RolID);
//       `);
//     }

//     for (const plataformaId of plataformaIds) {
//       const plataformaRequest = transaction.request();
//       plataformaRequest.input('UsuarioID', sql.Int, usuarioId);
//       plataformaRequest.input('PlataformaID', sql.Int, plataformaId);
//       plataformaRequest.input('Activo', sql.Bit, 1); 

//       await plataformaRequest.query(`
//         INSERT INTO USUARIO_PLATAFORMA (USUARIO_ID, PLATAFORMA_ID, ACTIVO)
//         VALUES (@UsuarioID, @PlataformaID, @Activo);
//       `);
//     }

//     await transaction.commit();
//     return { UsuarioID: usuarioId };

//   } catch (err) {
//     await transaction.rollback();
//     throw err;
//   }
// };

const insertarUsuario = async (
  correo,
  hashPassword,
  activo,
  usuarioCreadorId,
  perfil = {},
  rolesIds = [],         // <-- antes era rolId
  plataformaIds = []
) => {
  const pool = await IdServicePool.connect();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = transaction.request();

    request.input('correo', sql.NVarChar, correo);
    request.input('hashPassword', sql.NVarChar, hashPassword);
    request.input('activo', sql.Bit, activo);
    request.input('usuarioCreador', sql.Int, usuarioCreadorId);

    const usuarioResult = await request.query(`
      INSERT INTO Usuarios (
        CorreoElectronico, HashPassword, FechaCreacion, FechaActualizacion, Activo, UsuarioCreador
      )
      VALUES (@correo, @hashPassword, GETDATE(), NULL, @activo, @usuarioCreador);
      SELECT SCOPE_IDENTITY() AS UsuarioID;
    `);

    const usuarioId = usuarioResult.recordset[0].UsuarioID;

    // Perfiles (incluye canal)
    const perfilRequest = transaction.request();
    perfilRequest.input('UsuarioID', sql.Int, usuarioId);
    perfilRequest.input('Nombres', sql.NVarChar(100), perfil.nombres ?? null);
    perfilRequest.input('Apellidos', sql.NVarChar(100), perfil.apellidos ?? null);
    perfilRequest.input('RUT', sql.NVarChar(20), perfil.rut ?? null);
    perfilRequest.input('DepartamentoID', sql.Int, perfil.departamentoId ?? null);
    perfilRequest.input('Telefono', sql.NVarChar(20), perfil.telefono ?? null);
    perfilRequest.input('URLImagenPerfil', sql.NVarChar(255), perfil.urlImagenPerfil ?? null);
    perfilRequest.input('CanalDeVenta', sql.NVarChar(100), perfil.canalDeVenta ?? null);
    perfilRequest.input('CanalDeVentaId', sql.NVarChar(100), perfil.canalDeVentaId ?? null);

    await perfilRequest.query(`
      INSERT INTO Perfiles (
        UsuarioID, Nombres, Apellidos, RUT, DepartamentoID, Telefono, URLImagenPerfil, CanalDeVenta, CanalDeVentaId
      )
      VALUES (@UsuarioID, @Nombres, @Apellidos, @RUT, @DepartamentoID, @Telefono, @URLImagenPerfil, @CanalDeVenta, @CanalDeVentaId);
    `);

    // --- MÚLTIPLES ROLES ---
    if (Array.isArray(rolesIds) && rolesIds.length > 0) {
      for (const rolId of rolesIds) {
        const rolRequest = transaction.request();
        rolRequest.input('UsuarioID', sql.Int, usuarioId);
        rolRequest.input('RolID', sql.Int, rolId);
        await rolRequest.query(`
          INSERT INTO USUARIO_ROL (USUARIO_ID, ROL_ID)
          VALUES (@UsuarioID, @RolID);
        `);
      }
    }

    // Plataformas
    for (const plataformaId of plataformaIds) {
      const plataformaRequest = transaction.request();
      plataformaRequest.input('UsuarioID', sql.Int, usuarioId);
      plataformaRequest.input('PlataformaID', sql.Int, plataformaId);
      plataformaRequest.input('Activo', sql.Bit, 1);
      await plataformaRequest.query(`
        INSERT INTO USUARIO_PLATAFORMA (USUARIO_ID, PLATAFORMA_ID, ACTIVO)
        VALUES (@UsuarioID, @PlataformaID, @Activo);
      `);
    }

    await transaction.commit();
    return { UsuarioID: usuarioId };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

// const actualizarUsuarioYPerfil = async (
//   usuarioId,
//   datosUsuario,
//   datosPerfil,
//   usuarioActualizadorId,
//   rolId = null,
//   plataformaIds = []
// ) => {
//   const pool = await IdServicePool.connect();
//   const transaction = new sql.Transaction(pool);
//   await transaction.begin();

//   try {
//     const request = transaction.request();

//     // Usuarios
//     request.input('UsuarioID', sql.Int, usuarioId);
//     request.input('Correo', sql.NVarChar, datosUsuario.correo);
//     request.input('Activo', sql.Bit, datosUsuario.activo);
//     request.input('UsuarioActualizador', sql.Int, usuarioActualizadorId);

//     // Perfiles
//     request.input('Nombres', sql.NVarChar(100), datosPerfil.nombres ?? null);
//     request.input('Apellidos', sql.NVarChar(100), datosPerfil.apellidos ?? null);
//     request.input('RUT', sql.NVarChar(20), datosPerfil.rut ?? null);
//     request.input('DepartamentoID', sql.Int, datosPerfil.departamentoId ?? null);
//     request.input('Telefono', sql.NVarChar(20), datosPerfil.telefono ?? null);
//     request.input('URLImagenPerfil', sql.NVarChar(255), datosPerfil.urlImagenPerfil ?? null);
//     request.input('CanalDeVenta', sql.NVarChar(100), datosPerfil.canalDeVenta ?? null);
//     request.input('CanalDeVentaId', sql.NVarChar(100), datosPerfil.canalDeVentaId ?? null);

//     const query = `
//       -- Actualiza Usuario
//       UPDATE Usuarios
//       SET CorreoElectronico = @Correo,
//           Activo = @Activo,
//           FechaActualizacion = GETDATE(),
//           UsuarioActualizador = @UsuarioActualizador
//       WHERE UsuarioID = @UsuarioID;

//       -- Inserta o actualiza Perfil
//       IF EXISTS (SELECT 1 FROM Perfiles WHERE UsuarioID = @UsuarioID)
//       BEGIN
//         UPDATE Perfiles
//         SET Nombres = @Nombres,
//             Apellidos = @Apellidos,
//             RUT = @RUT,
//             DepartamentoID = @DepartamentoID,
//             Telefono = @Telefono,
//             URLImagenPerfil = @URLImagenPerfil,
//             CanalDeVenta = @CanalDeVenta,
//             CanalDeVentaId = @CanalDeVentaId
//         WHERE UsuarioID = @UsuarioID;
//       END
//       ELSE
//       BEGIN
//         INSERT INTO Perfiles (
//           UsuarioID,
//           Nombres,
//           Apellidos,
//           RUT,
//           DepartamentoID,
//           Telefono,
//           URLImagenPerfil,
//           CanalDeVenta,
//           CanalDeVentaId
//         ) VALUES (
//           @UsuarioID,
//           @Nombres,
//           @Apellidos,
//           @RUT,
//           @DepartamentoID,
//           @Telefono,
//           @URLImagenPerfil,
//           @CanalDeVenta,
//           @CanalDeVentaId
//         );
//       END;

//       -- Elimina rol anterior y asigna nuevo si se envía
//       DELETE FROM USUARIO_ROL WHERE USUARIO_ID = @UsuarioID;
//     `;

//     await request.query(query);

//     // Insertar nuevo rol 
//     if (rolId !== null) {
//       const rolReq = transaction.request();
//       rolReq.input('UsuarioID', sql.Int, usuarioId);
//       rolReq.input('RolID', sql.Int, rolId);

//       await rolReq.query(`
//         INSERT INTO USUARIO_ROL (USUARIO_ID, ROL_ID)
//         VALUES (@UsuarioID, @RolID);
//       `);
//     }

//     // Manejo de plataformas (sincronización completa)
//     if (Array.isArray(plataformaIds)) {
//       const currentReq = transaction.request();
//       currentReq.input('UsuarioID', sql.Int, usuarioId);

//       const currentResult = await currentReq.query(`
//         SELECT PLATAFORMA_ID
//         FROM USUARIO_PLATAFORMA
//         WHERE USUARIO_ID = @UsuarioID
//       `);

//       const plataformasActuales = currentResult.recordset.map(p => p.PLATAFORMA_ID);
//       const plataformasAInsertar = plataformaIds.filter(id => !plataformasActuales.includes(id));
//       const plataformasAEliminar = plataformasActuales.filter(id => !plataformaIds.includes(id));

//       // Insertar nuevas plataformas
//       for (const plataformaId of plataformasAInsertar) {
//         const insertReq = transaction.request();
//         insertReq.input('UsuarioID', sql.Int, usuarioId);
//         insertReq.input('PlataformaID', sql.Int, plataformaId);
//         insertReq.input('ACTIVO', sql.Bit, 1);

//         await insertReq.query(`
//           INSERT INTO USUARIO_PLATAFORMA (USUARIO_ID, PLATAFORMA_ID, ACTIVO)
//           VALUES (@UsuarioID, @PlataformaID, @ACTIVO);
//         `);
//       }

//       // Eliminar accesos no deseados
//       if (plataformasAEliminar.length > 0) {
//         const deleteReq = transaction.request();
//         deleteReq.input('UsuarioID', sql.Int, usuarioId);

//         const ids = plataformasAEliminar.join(',');
//         await deleteReq.query(`
//           DELETE FROM USUARIO_PLATAFORMA
//           WHERE USUARIO_ID = @UsuarioID AND PLATAFORMA_ID IN (${ids});
//         `);
//       }
//     }

//     await transaction.commit();
//   } catch (err) {
//     await transaction.rollback();
//     throw err;
//   }
// };
const actualizarUsuarioYPerfil = async (
  usuarioId,
  datosUsuario,
  datosPerfil,
  usuarioActualizadorId,
  rolesIds = [],         // <-- antes rolId
  plataformaIds = []
) => {
  const pool = await IdServicePool.connect();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = transaction.request();

    // Usuarios
    request.input('UsuarioID', sql.Int, usuarioId);
    request.input('Correo', sql.NVarChar, datosUsuario.correo);
    request.input('Activo', sql.Bit, datosUsuario.activo);
    request.input('UsuarioActualizador', sql.Int, usuarioActualizadorId);

    // Perfiles
    request.input('Nombres', sql.NVarChar(100), datosPerfil.nombres ?? null);
    request.input('Apellidos', sql.NVarChar(100), datosPerfil.apellidos ?? null);
    request.input('RUT', sql.NVarChar(20), datosPerfil.rut ?? null);
    request.input('DepartamentoID', sql.Int, datosPerfil.departamentoId ?? null);
    request.input('Telefono', sql.NVarChar(20), datosPerfil.telefono ?? null);
    request.input('URLImagenPerfil', sql.NVarChar(255), datosPerfil.urlImagenPerfil ?? null);
    request.input('CanalDeVenta', sql.NVarChar(100), datosPerfil.canalDeVenta ?? null);
    request.input('CanalDeVentaId', sql.NVarChar(100), datosPerfil.canalDeVentaId ?? null);

    await request.query(`
      UPDATE Usuarios
         SET CorreoElectronico = @Correo,
             Activo = @Activo,
             FechaActualizacion = GETDATE(),
             UsuarioActualizador = @UsuarioActualizador
       WHERE UsuarioID = @UsuarioID;

      IF EXISTS (SELECT 1 FROM Perfiles WHERE UsuarioID = @UsuarioID)
      BEGIN
        UPDATE Perfiles
           SET Nombres = @Nombres,
               Apellidos = @Apellidos,
               RUT = @RUT,
               DepartamentoID = @DepartamentoID,
               Telefono = @Telefono,
               URLImagenPerfil = @URLImagenPerfil,
               CanalDeVenta = @CanalDeVenta,
               CanalDeVentaId = @CanalDeVentaId
         WHERE UsuarioID = @UsuarioID;
      END
      ELSE
      BEGIN
        INSERT INTO Perfiles (
          UsuarioID, Nombres, Apellidos, RUT, DepartamentoID, Telefono, URLImagenPerfil, CanalDeVenta, CanalDeVentaId
        ) VALUES (
          @UsuarioID, @Nombres, @Apellidos, @RUT, @DepartamentoID, @Telefono, @URLImagenPerfil, @CanalDeVenta, @CanalDeVentaId
        );
      END;

      -- Sincronización de ROLES: borra y vuelve a insertar los enviados
      DELETE FROM USUARIO_ROL WHERE USUARIO_ID = @UsuarioID;
    `);

    if (Array.isArray(rolesIds) && rolesIds.length > 0) {
      for (const rolId of rolesIds) {
        const rolReq = transaction.request();
        rolReq.input('UsuarioID', sql.Int, usuarioId);
        rolReq.input('RolID', sql.Int, rolId);
        await rolReq.query(`
          INSERT INTO USUARIO_ROL (USUARIO_ID, ROL_ID)
          VALUES (@UsuarioID, @RolID);
        `);
      }
    }

    // Plataformas (igual que antes)
    if (Array.isArray(plataformaIds)) {
      const currentReq = transaction.request();
      currentReq.input('UsuarioID', sql.Int, usuarioId);

      const currentResult = await currentReq.query(`
        SELECT PLATAFORMA_ID
          FROM USUARIO_PLATAFORMA
         WHERE USUARIO_ID = @UsuarioID
      `);

      const plataformasActuales = currentResult.recordset.map(p => p.PLATAFORMA_ID);
      const plataformasAInsertar = plataformaIds.filter(id => !plataformasActuales.includes(id));
      const plataformasAEliminar = plataformasActuales.filter(id => !plataformaIds.includes(id));

      for (const plataformaId of plataformasAInsertar) {
        const insertReq = transaction.request();
        insertReq.input('UsuarioID', sql.Int, usuarioId);
        insertReq.input('PlataformaID', sql.Int, plataformaId);
        insertReq.input('ACTIVO', sql.Bit, 1);
        await insertReq.query(`
          INSERT INTO USUARIO_PLATAFORMA (USUARIO_ID, PLATAFORMA_ID, ACTIVO)
          VALUES (@UsuarioID, @PlataformaID, @ACTIVO);
        `);
      }

      if (plataformasAEliminar.length > 0) {
        const deleteReq = transaction.request();
        deleteReq.input('UsuarioID', sql.Int, usuarioId);
        const ids = plataformasAEliminar.join(',');
        await deleteReq.query(`
          DELETE FROM USUARIO_PLATAFORMA
          WHERE USUARIO_ID = @UsuarioID AND PLATAFORMA_ID IN (${ids});
        `);
      }
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
async function getUsuarios(opts) {
  await IdServicePool;

  const where = [];
  const request = IdServicePool.request();

  if (opts.document) {
    where.push('p.RUT LIKE @document');
    request.input('document', sql.NVarChar(20), `%${opts.document}%`);
  }

  if (opts.firstname) {
    where.push('p.Nombres LIKE @firstname');
    request.input('firstname', sql.NVarChar(100), `%${opts.firstname}%`);
  }

  if (opts.lastname) {
    where.push('p.Apellidos LIKE @lastname');
    request.input('lastname', sql.NVarChar(100), `%${opts.lastname}%`);
  }

  if (opts.email) {
    where.push('u.CorreoElectronico LIKE @correo');
    request.input('correo', sql.NVarChar(255), `%${opts.email}%`);
  }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sqlText = `
    WITH Q AS (
      SELECT 
        u.UsuarioID AS ID,
        p.RUT AS DOCUMENT,
        u.CorreoElectronico AS EMAIL,
        u.FechaActualizacion AS DATE_UPDATED,
        p.Nombres AS FIRSTNAME,
        p.Apellidos AS LASTNAME,
        p.URLImagenPerfil AS IMAGEN,
        -- NUEVO: Devolver canal de venta (nombre e id)
        p.CanalDeVenta AS SALES_CHANNEL_NAME,
        p.CanalDeVentaId AS SALES_CHANNEL_ID,
        u.Activo AS ACTIVE,
        d.Nombre AS DEPARTMENTS,
        pc.URLImagenPerfil AS IMAGE_USER_CREATED,
        pc.Nombres AS USER_NAME_CREATED,
        uc.CorreoElectronico AS EMAIL_USER_CREATED,
        u.FechaCreacion AS DATE_CREATED,
        COUNT(*) OVER() AS totalRecords
      FROM Usuarios u
      LEFT JOIN Perfiles p ON p.UsuarioID = u.UsuarioID
      LEFT JOIN Departamentos d ON d.DepartamentoID = p.DepartamentoID
      LEFT JOIN Usuarios uc ON u.UsuarioCreador = uc.UsuarioID
      LEFT JOIN Perfiles pc ON pc.UsuarioID = uc.UsuarioID
      ${whereSQL}
    )
    SELECT *
    FROM Q
    ORDER BY DATE_CREATED DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  request.input('offset', sql.Int, (opts.page - 1) * opts.pageSize);
  request.input('pageSize', sql.Int, opts.pageSize);

  const result = await request.query(sqlText);

  const totalRecords = result.recordset[0]?.totalRecords || 0;

  return {
    page: opts.page,
    pageSize: opts.pageSize,
    totalRecords,
    totalPages: Math.ceil(totalRecords / opts.pageSize),
    data: result.recordset.map(({ totalRecords, ...row }) => row)
  };
}


module.exports = { obtenerUsuarioPorCorreo, insertarUsuario, actualizarUsuarioYPerfil, getUsuarios, };
