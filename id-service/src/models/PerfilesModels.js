const { sql, IdServicePool } = require('../config/dbnew');

const editarPerfilUsuario = async (usuarioId, datosPerfil) => {
  const pool = await IdServicePool.connect();

  const request = pool.request();
  request.input('UsuarioID', sql.Int, usuarioId);
  request.input('Nombres', sql.NVarChar(100), datosPerfil.nombres ?? null);
  request.input('Apellidos', sql.NVarChar(100), datosPerfil.apellidos ?? null);
  request.input('RUT', sql.NVarChar(20), datosPerfil.rut ?? null);
  request.input('Telefono', sql.NVarChar(20), datosPerfil.telefono ?? null);
  request.input('URLImagenPerfil', sql.NVarChar(255), datosPerfil.urlImagenPerfil ?? null);

  const query = `
    IF EXISTS (SELECT 1 FROM Perfiles WHERE UsuarioID = @UsuarioID)
    BEGIN
      UPDATE Perfiles
      SET Nombres = @Nombres,
          Apellidos = @Apellidos,
          RUT = @RUT,
          Telefono = @Telefono,
          URLImagenPerfil = @URLImagenPerfil
      WHERE UsuarioID = @UsuarioID;
    END
    ELSE
    BEGIN
      INSERT INTO Perfiles (
        UsuarioID, Nombres, Apellidos, RUT, Telefono, URLImagenPerfil
      ) VALUES (
        @UsuarioID, @Nombres, @Apellidos, @RUT, @Telefono, @URLImagenPerfil
      );
    END;
  `;

  await request.query(query);
};

const getPerfilPorUsuarioId = async (usuarioId) => {
  const pool = await IdServicePool;
  const result = await pool.request()
    .input('usuarioId', usuarioId)
    .query(`
      SELECT 
        P.PerfilID,
        P.UsuarioID,
        U.CorreoElectronico,
        P.Nombres,
        P.Apellidos,
        P.RUT,
        D.Nombre AS NombreDepartamento,
        P.Telefono,
        P.URLImagenPerfil
      FROM PERFILES P
      JOIN USUARIOS U ON P.UsuarioID = U.UsuarioID
      LEFT JOIN DEPARTAMENTOS D ON P.DepartamentoID = D.DepartamentoID
      WHERE P.UsuarioID = @usuarioId
    `);

  return result.recordset[0] || null;
};
const actualizarUrlImagenPerfil = async (usuarioId, urlImagen) => {
  const pool = await IdServicePool;
  await pool.request()
    .input('usuarioId', usuarioId)
    .input('urlImagen', urlImagen)
    .query(`
      UPDATE PERFILES
      SET URLImagenPerfil = @urlImagen
      WHERE UsuarioID = @usuarioId
    `);
};

module.exports = {
  editarPerfilUsuario, getPerfilPorUsuarioId, actualizarUrlImagenPerfil
};
