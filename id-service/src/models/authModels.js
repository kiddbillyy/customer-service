const { sql, IdServicePool } = require('../config/dbnew');
const moment = require('moment-timezone'); 
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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

const generarCodigoOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const crearOtpYEnviar = async (correo, sendOtpEvent) => {
  const pool = await IdServicePool.connect();

  // 1. Verificar si el usuario existe y está activo
  const usuarioResult = await pool.request()
    .input('correo', sql.NVarChar(255), correo)
    .query(`
      SELECT UsuarioID, Activo FROM Usuarios
      WHERE CorreoElectronico = @correo
    `);

  const usuario = usuarioResult.recordset[0];

  if (!usuario) {
    throw new Error('El correo no está registrado.');
  }

  if (!usuario.Activo) {
    throw new Error('El usuario está inactivo.');
  }

  const usuarioId = usuario.UsuarioID;

  // 2. Generar código OTP
  const codigo = generarCodigoOTP();

  // 3. Guardar en la tabla OTP
  const now = new Date();
  const expiracion = new Date(now.getTime() + 10 * 60 * 1000); // +10 minutos

  await pool.request()
    .input('usuarioId', sql.Int, usuarioId)
    .input('codigo', sql.NVarChar(6), codigo)
    .input('fechaCreacion', sql.DateTime, now)
    .input('fechaExpiracion', sql.DateTime, expiracion)
    .input('usado', sql.Bit, 0)
    .query(`
      INSERT INTO OTP (
        USUARIO_ID,
        CODIGO,
        FECHA_CREACION,
        FECHA_EXPIRACION,
        USADO
      )
      VALUES (
        @usuarioId,
        @codigo,
        @fechaCreacion,
        @fechaExpiracion,
        @usado
      )
    `);

  // 4. Enviar a Kafka
  await sendOtpEvent({ to: correo, code: codigo, template: 'recuperacion-otp' });

  return { message: 'Código OTP generado y enviado al correo.' };
};

//VALIDAR OTP
const validarOtp = async (correo, codigoOtp) => {
    const pool = await IdServicePool;
    const query = `
        SELECT o.USUARIO_ID, o.CODIGO, o.FECHA_EXPIRACION, o.USADO, u.HashPassword 
        FROM OTP o
        JOIN USUARIOS u ON u.UsuarioID = o.USUARIO_ID
        WHERE u.CorreoElectronico = @correo AND o.CODIGO = @codigoOtp AND o.USADO = 0
    `;
    const result = await pool.request()
        .input('correo', sql.NVarChar, correo)
        .input('codigoOtp', sql.NVarChar, codigoOtp)
        .query(query);

    if (result.recordset.length === 0) {
        return null;
    }

    const otpData = result.recordset[0];

    const fechaExpiracion = moment(otpData.FECHA_EXPIRACION).tz('America/Santiago');
    if (fechaExpiracion.isBefore(moment().tz('America/Santiago'))) {
        return null;
    }

    return otpData;
};

// Marcar OTP como usado (CORREGIDO)
const marcarOtpComoUsado = async (usuarioId, codigoOtp) => {
    const pool = await IdServicePool;
    const query = `
        UPDATE OTP 
        SET USADO = 1
        WHERE CODIGO = @codigoOtp AND USUARIO_ID = @usuarioId
    `;
    await pool.request()
        .input('codigoOtp', sql.NVarChar, codigoOtp)
        .input('usuarioId', sql.Int, usuarioId) // Usamos directamente el ID
        .query(query);
};


module.exports = { cerrarSesion, validarCredencialesParaRenovar, crearOtpYEnviar,validarOtp, marcarOtpComoUsado };
