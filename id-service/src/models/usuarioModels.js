const { sql, IdServicePool } = require('../config/dbnew');

// Buscar usuario por correo
const obtenerUsuarioPorCorreo = async (correo) => {
  const pool = await IdServicePool.connect();
  const result = await pool.request()
    .input('correo', sql.NVarChar, correo)
    .query('SELECT * FROM Usuarios WHERE CorreoElectronico = @correo');
  
  return result.recordset[0];
};

// Obtener ID de usuario por correo
const findUserIdByEmail = async (email) => {
  const pool = await IdServicePool.connect();
  const result = await pool.request()
    .input('Email', sql.NVarChar(255), email)
    .query(`
      SELECT TOP 1 UsuarioID
      FROM dbo.Usuarios
      WHERE CorreoElectronico = @Email;
    `);

  return result.recordset?.[0]?.UsuarioID ?? null;
};

// Insertar nuevo usuario con el ID del creador
const insertarUsuario = async (correo, hashPassword, activo, correoCreador) => {
  const pool = await IdServicePool.connect();

  const usuarioCreadorId = await findUserIdByEmail(correoCreador);

  if (!usuarioCreadorId) {
    throw new Error(`No se encontró un usuario con el correo: ${correoCreador}`);
  }

  const result = await pool.request()
    .input('correo', sql.NVarChar, correo)
    .input('hashPassword', sql.NVarChar, hashPassword)
    .input('activo', sql.Bit, activo)
    .input('usuarioCreador', sql.Int, usuarioCreadorId)
    .query(`
      INSERT INTO Usuarios (CorreoElectronico, HashPassword, FechaCreacion, FechaActualizacion, Activo, UsuarioCreador)
      VALUES (@correo, @hashPassword, GETDATE(), NULL, @activo, @usuarioCreador);
      SELECT SCOPE_IDENTITY() AS UsuarioID;
    `);

  return result.recordset[0];
};

const actualizarUsuarioYPerfil = async (usuarioId, datosUsuario, datosPerfil, correoActualizador) => {
  const pool = await IdServicePool.connect();

  const usuarioActualizadorId = await findUserIdByEmail(correoActualizador);
  if (!usuarioActualizadorId) {
    throw new Error(`No se encontró un usuario con el correo: ${correoActualizador}`);
  }

  const request = pool.request();

  // Inputs para tabla Usuarios
  request.input('UsuarioID', sql.Int, usuarioId);
  request.input('Correo', sql.NVarChar, datosUsuario.correo);
  request.input('Activo', sql.Bit, datosUsuario.activo);
  request.input('UsuarioActualizador', sql.Int, usuarioActualizadorId);

  // Inputs para tabla Perfiles
  request.input('Nombres', sql.NVarChar(100), datosPerfil.nombres ?? null);
  request.input('Apellidos', sql.NVarChar(100), datosPerfil.apellidos ?? null);
  request.input('RUT', sql.NVarChar(20), datosPerfil.rut ?? null);
  request.input('DepartamentoID', sql.Int, datosPerfil.departamentoId ?? null);
  request.input('Telefono', sql.NVarChar(20), datosPerfil.telefono ?? null);

  const query = `
    BEGIN TRANSACTION;

    -- Actualiza los datos del usuario
    UPDATE Usuarios
    SET CorreoElectronico = @Correo,
        Activo = @Activo,
        FechaActualizacion = GETDATE(),
        UsuarioActualizador = @UsuarioActualizador
    WHERE UsuarioID = @UsuarioID;

    -- Si el perfil existe, lo actualiza
    IF EXISTS (SELECT 1 FROM Perfiles WHERE UsuarioID = @UsuarioID)
    BEGIN
      UPDATE Perfiles
      SET Nombres = @Nombres,
          Apellidos = @Apellidos,
          RUT = @RUT,
          DepartamentoID = @DepartamentoID,
          Telefono = @Telefono
      WHERE UsuarioID = @UsuarioID;
    END
    ELSE
    BEGIN
      INSERT INTO Perfiles (
        UsuarioID,
        Nombres,
        Apellidos,
        RUT,
        DepartamentoID,
        Telefono
      ) VALUES (
        @UsuarioID,
        @Nombres,
        @Apellidos,
        @RUT,
        @DepartamentoID,
        @Telefono
      );
    END

    COMMIT;
  `;

  await request.query(query);
};

module.exports = {
  obtenerUsuarioPorCorreo,
  insertarUsuario, actualizarUsuarioYPerfil,
};
