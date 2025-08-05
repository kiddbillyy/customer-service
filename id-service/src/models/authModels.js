const { sql, IdServicePool } = require('../config/dbnew');
const bcrypt = require('bcryptjs');

const cerrarSesion = async (usuarioId, plataformaId, token) => {
  const pool = await IdServicePool.connect();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = transaction.request();
    request.input('usuarioId', sql.Int, usuarioId);
    request.input('plataformaId', sql.Int, plataformaId);
    request.input('token', sql.NVarChar, token);

    // Validar que el token corresponde al usuario/plataforma
    const validacion = await request.query(`
      SELECT 1
      FROM TOKENS_ACTIVOS
      WHERE TOKEN = @token
        AND USUARIO_ID = @usuarioId
        AND PLATAFORMA_ID = @plataformaId
        AND VALIDO = 1
    `);

    if (!validacion.recordset.length) {
      throw new Error('El token no pertenece al usuario o plataforma, o ya fue invalidado.');
    }

    // Invalidar todos los tokens activos del usuario en esa plataforma
    await request.query(`
      UPDATE TOKENS_ACTIVOS
      SET VALIDO = 0
      WHERE USUARIO_ID = @usuarioId
        AND PLATAFORMA_ID = @plataformaId
        AND VALIDO = 1;
    `);

    // Marcar en HISTORIAL_SESIONES el cierre de sesión para ese token
    await request.query(`
      UPDATE HISTORIAL_SESIONES
      SET FECHA_CIERRE = GETDATE(),
          CERRADA_MANUALMENTE = 1
      WHERE TOKEN = @token;
    `);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
const validarCredencialesParaRenovar = async (correo, password) => {
  const pool = await IdServicePool.connect();

  const result = await pool.request()
    .input('correo', sql.NVarChar(255), correo)
    .query('SELECT * FROM Usuarios WHERE CorreoElectronico = @correo');

  const usuario = result.recordset[0];

  if (!usuario) {
    throw new Error('Usuario no encontrado.');
  }

  if (!usuario.Activo) {
    throw new Error('El usuario no está activo.');
  }

  const esValida = bcrypt.compareSync(password, usuario.HashPassword);
  if (!esValida) {
    throw new Error('Contraseña incorrecta.');
  }

  return usuario;
};
module.exports = { cerrarSesion, validarCredencialesParaRenovar };
