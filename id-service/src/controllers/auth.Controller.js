const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, IdServicePool } = require('../config/dbnew');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const { DateTime } = require('luxon');
const timezone = require('dayjs/plugin/timezone');
const { cerrarSesion, validarCredencialesParaRenovar, crearOtpYEnviar, validarOtp, actualizarContraseña, marcarOtpComoUsado, validarSoloOtp } = require('../models/authModels');
const { ValidationError, UnauthorizedError, sendError } = require('../utils/errors');
const {  nowSCLIso, nowSCLSql121,toSCLSql121 } = require('../utils/dates');
const { sendOtpEvent } = require('../utils/kafkaUtils')
require('dotenv').config();


dayjs.extend(utc);
dayjs.extend(timezone);


const login = async (req, res) => {
  const { correo, password, plataformaId, ip, dispositivo, forzarSesion = false } = req.body;

  if (!correo || !password || !plataformaId) {
    return res.status(400).json({ error: 'Correo, contraseña y plataformaId son obligatorios.' });
  }

  const pool = await IdServicePool.connect();

  const usuarioResult = await pool.request()
    .input('Correo', sql.NVarChar(255), correo)
    .query(`
      SELECT
        u.UsuarioID,
        u.CorreoElectronico,
        u.HashPassword,
        u.Activo,
        p.Nombres,
        p.Apellidos
      FROM Usuarios u
      LEFT JOIN Perfiles p ON u.UsuarioID = p.UsuarioID
      WHERE u.CorreoElectronico = @Correo
    `);

  const usuario = usuarioResult.recordset[0];

  if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado.' });
  if (!usuario.Activo) return res.status(403).json({ error: 'El usuario no está activo.' });

  const esValida = bcrypt.compareSync(password, usuario.HashPassword);
  if (!esValida) return res.status(401).json({ error: 'Contraseña incorrecta.' });

  const accesoPlataforma = await pool.request()
    .input('UsuarioID', sql.Int, usuario.UsuarioID)
    .input('PlataformaID', sql.Int, plataformaId)
    .query(`
      SELECT * FROM USUARIO_PLATAFORMA
      WHERE USUARIO_ID = @UsuarioID AND PLATAFORMA_ID = @PlataformaID AND ACTIVO = 1
    `);

  if (accesoPlataforma.recordset.length === 0) {
    return res.status(403).json({ error: 'No tienes acceso activo a esta plataforma.' });
  }

  const tokenExistente = await pool.request()
    .input('UsuarioID', sql.Int, usuario.UsuarioID)
    .input('PlataformaID', sql.Int, plataformaId)
    .query(`
      SELECT * FROM TOKENS_ACTIVOS
      WHERE USUARIO_ID = @UsuarioID AND PLATAFORMA_ID = @PlataformaID AND VALIDO = 1 AND FECHA_EXPIRACION > GETDATE()
    `);

  if (tokenExistente.recordset.length > 0 && !forzarSesion) {
    return res.status(409).json({
      error: 'Ya existe una sesión activa. ¿Deseas cerrarla e iniciar una nueva?',
      requiereConfirmacion: true
    });
  }

  if (tokenExistente.recordset.length > 0 && forzarSesion) {
    await pool.request()
      .input('UsuarioID', sql.Int, usuario.UsuarioID)
      .input('PlataformaID', sql.Int, plataformaId)
      .query(`
        UPDATE TOKENS_ACTIVOS
        SET VALIDO = 0
        WHERE USUARIO_ID = @UsuarioID AND PLATAFORMA_ID = @PlataformaID AND VALIDO = 1
      `);
  }

  // Construcción del payload
  const payload = {
    usuarioId: usuario.UsuarioID,
    correo: usuario.CorreoElectronico,
    plataformaId: plataformaId
  };

  //  Duración condicional del token
  let duracionSegundos;
  if (usuario.UsuarioID === 4 || usuario.CorreoElectronico === "fpino@mimbral.cl") {
    duracionSegundos = 60 * 5; // 5 minutos
  } else {
    duracionSegundos = 60 * 60 * 7; // 7 horas
  }

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: duracionSegundos });

  // Hora local de Santiago
  const nowSantiago = dayjs().tz('America/Santiago');
  const expiracionSantiago = nowSantiago.add(duracionSegundos, 'second');

  const nowFormatted = nowSantiago.format('YYYY-MM-DD HH:mm:ss');
  const expiracionFormatted = expiracionSantiago.format('YYYY-MM-DD HH:mm:ss');
  console.log("Fecha de expiracion",expiracionFormatted)

  await pool.request() 
    .input('UsuarioID', sql.Int, usuario.UsuarioID)
    .input('PlataformaID', sql.Int, plataformaId)
    .input('Token', sql.NVarChar, token)
    .input('Valido', sql.Bit, 1)
    .input('IP', sql.NVarChar(50), ip ?? null)
    .input('Dispositivo', sql.NVarChar(100), dispositivo ?? null)
    .input('FechaCreacion', sql.DateTime, nowFormatted)
    .input('FechaExpiracion', sql.DateTime, expiracionFormatted)
    .query(`
      INSERT INTO TOKENS_ACTIVOS (
        USUARIO_ID, PLATAFORMA_ID, TOKEN, VALIDO, IP, DISPOSITIVO, FECHA_CREACION, FECHA_EXPIRACION
      )
      VALUES (
        @UsuarioID, @PlataformaID, @Token, @Valido, @IP, @Dispositivo, @FechaCreacion, @FechaExpiracion
      )
    `);
  // Después de insertar el nuevo token
  await pool.request()
    .input('UsuarioID', sql.Int, usuario.UsuarioID)
    .input('PlataformaID', sql.Int, plataformaId)
    .input('Token', sql.NVarChar, token)
    .query(`
      UPDATE TOKENS_ACTIVOS
      SET VALIDO = 0
      WHERE USUARIO_ID = @UsuarioID
        AND PLATAFORMA_ID = @PlataformaID
        AND VALIDO = 1
        AND TOKEN <> @Token;  -- no toques el recién insertado
    `);

  await pool.request()
    .input('UsuarioID', sql.Int, usuario.UsuarioID)
    .input('PlataformaID', sql.Int, plataformaId)
    .input('FechaInicio', sql.DateTime, nowFormatted)
    .input('FechaCierre', sql.DateTime, expiracionFormatted)
    .input('Token', sql.NVarChar, token)
    .input('IP', sql.NVarChar(50), ip ?? null)
    .input('Dispositivo', sql.NVarChar(100), dispositivo ?? null)
    .query(`
      INSERT INTO HISTORIAL_SESIONES (
        USUARIO_ID,
        PLATAFORMA_ID,
        FECHA_INICIO,
        FECHA_CIERRE,
        TOKEN,
        IP,
        DISPOSITIVO
      )
      VALUES (
        @UsuarioID,
        @PlataformaID,
        @FechaInicio,
        @FechaCierre,
        @Token,
        @IP,
        @Dispositivo
      )
    `);

  res.status(200).json({
    message: 'Inicio de sesión exitoso.',
    token,
    usuarioId: usuario.UsuarioID,
    correo: usuario.CorreoElectronico,
    nombre: usuario.Nombres,
    apellido: usuario.Apellidos,
    plataformaId,
    expiracion: expiracionFormatted
  });
};

// CERRAR SESIÓN 
const cerrarSesionController = async (req, res) => {
  try {
    const { usuarioId, plataformaId } = req.body;
    const authHeader = req.headers.authorization;

    if (!usuarioId || !plataformaId) {
      return res.status(400).json({ error: 'usuarioId y plataformaId son requeridos en el body.' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado o inválido.' });
    }

    const token = authHeader.slice(7); 

    await cerrarSesion(usuarioId, plataformaId, token);

    res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
  } catch (error) {
    console.error('Error al cerrar sesión:', error);

    if (error.message?.includes('El token no pertenece')) {
      return res.status(403).json({ error: error.message });
    }

    res.status(500).json({ error: 'Error interno al cerrar sesión.' });
  }
};
const renovarSesion = async (req, res) => {
  try {
    const { password } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw UnauthorizedError('Token no proporcionado o inválido.');
    }
    if (!password) {
      throw ValidationError('La contraseña es requerida.', { field: 'password' });
    }

    const tokenAnterior = authHeader.slice(7);

    // 1) Verificar firma/exp del token anterior
    let payload;
    try {
      payload = jwt.verify(tokenAnterior, process.env.JWT_SECRET);
    } catch {
      throw UnauthorizedError('Token inválido o expirado.');
    }

    const { correo, plataformaId } = payload || {};
    if (!correo || !plataformaId) {
      throw ValidationError('El token no contiene los datos necesarios.', { missing: ['correo', 'plataformaId'] });
    }

    // 2) Validar credenciales (correo activo + password)
    const usuario = await validarCredencialesParaRenovar(correo, password);
    const usuarioId = usuario.UsuarioID;

    // Fechas en America/Santiago usando tus utils (strings SQL-121)
    const fechaCreacion = toSCLSql121(); // ahora
    const fechaExpiracion = toSCLSql121(
  DateTime.now().setZone("America/Santiago").plus({ hours: 3 })
);

    const fechaCierre = fechaCreacion; 
    console.log("Fecha de cierre", fechaCierre);
    const fechaInicio = fechaCreacion; 

    const pool = await IdServicePool.connect();
    const transaction = new sql.Transaction(pool);

    let txBegun = false; 
    try {
      await transaction.begin();
      txBegun = true;
      // 0) Verificar que el token anterior esté ACTIVO en BD (evita renovar revocados)
      const check = await transaction.request()
        .input('tokenAnterior', sql.NVarChar(sql.MAX), tokenAnterior)
        .input('usuarioId', sql.Int, usuarioId)
        .input('plataformaId', sql.Int, plataformaId)
        .query(`
          SELECT TOP 1 1 AS ok
          FROM TOKENS_ACTIVOS WITH (UPDLOCK, HOLDLOCK)
          WHERE TOKEN = @tokenAnterior
            AND USUARIO_ID = @usuarioId
            AND PLATAFORMA_ID = @plataformaId
            AND VALIDO = 1;
        `);

      if (check.recordset.length === 0) {
        throw UnauthorizedError('Token inválido o expirado.');
      }

      // 1) Invalidar tokens anteriores (incluye el tokenAnterior)
      await transaction.request()
        .input('usuarioId', sql.Int, usuarioId)
        .input('plataformaId', sql.Int, plataformaId)
        .query(`
          UPDATE TOKENS_ACTIVOS
          SET VALIDO = 0
          WHERE USUARIO_ID = @usuarioId
            AND PLATAFORMA_ID = @plataformaId
            AND VALIDO = 1;
        `);

      // 2) Cerrar historial del token anterior (usa string SQL-121 para mantener hora local)
      await transaction.request()
        .input('tokenAnterior', sql.NVarChar(sql.MAX), tokenAnterior)
        .input('fechaCierre', sql.VarChar(23), fechaCierre)
        .query(`
          UPDATE HISTORIAL_SESIONES
          SET FECHA_CIERRE = @fechaCierre,
              CERRADA_MANUALMENTE = 1
          WHERE TOKEN = @tokenAnterior;
        `);

      // 3) Generar nuevo token (3h)
      const nuevoPayload = { usuarioId, correo, plataformaId };
      const nuevoToken = jwt.sign(nuevoPayload, process.env.JWT_SECRET, { expiresIn: '3h' });

      // 4) Insertar nuevo token en TOKENS_ACTIVOS (fechas como strings locales)
      await transaction.request()
        .input('UsuarioID', sql.Int, usuarioId)
        .input('PlataformaID', sql.Int, plataformaId)
        .input('Token', sql.NVarChar(sql.MAX), nuevoToken)
        .input('Valido', sql.Bit, 1)
        .input('IP', sql.NVarChar(50), req.ip ?? null)
        .input('FechaCreacion', sql.VarChar(23), fechaCreacion)
        .input('FechaExpiracion', sql.VarChar(23), fechaExpiracion)
        .query(`
          INSERT INTO TOKENS_ACTIVOS (
            USUARIO_ID, PLATAFORMA_ID, TOKEN, VALIDO, IP, FECHA_CREACION, FECHA_EXPIRACION
          )
          VALUES (
            @UsuarioID, @PlataformaID, @Token, @Valido, @IP, @FechaCreacion, @FechaExpiracion
          );
        `);

      // 5) Registrar en HISTORIAL_SESIONES (también con string local)
      await transaction.request()
        .input('UsuarioID', sql.Int, usuarioId)
        .input('PlataformaID', sql.Int, plataformaId)
        .input('FechaInicio', sql.VarChar(23), fechaInicio)
        .input('Token', sql.NVarChar(sql.MAX), nuevoToken)
        .input('IP', sql.NVarChar(50), req.ip ?? null)
        .query(`
          INSERT INTO HISTORIAL_SESIONES (
            USUARIO_ID, PLATAFORMA_ID, FECHA_INICIO, TOKEN, IP
          )
          VALUES (
            @UsuarioID, @PlataformaID, @FechaInicio, @Token, @IP
          );
        `);

      await transaction.commit();

      return res.status(200).json({
        message: 'Sesión renovada correctamente.',
        token: nuevoToken
      });
    } catch (txErr) {
      if (txBegun) {
        try {
          await transaction.rollback();
        } catch (rbErr) {
          console.error('Error al hacer rollback:', rbErr);
        }
      }
      throw txErr;
    }
  } catch (err) {
    return sendError(res, err);
  }
};

const solicitarRecuperacionController = async (req, res) => {
  try {
    const { correo } = req.body;

    if (!correo) {
      return res.status(400).json({ error: 'El campo correo es obligatorio.' });
    }

    const resultado = await crearOtpYEnviar(correo, sendOtpEvent);

    return res.status(200).json(resultado);
  } catch (error) {
    console.error('Error al generar código OTP:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
};

// Cambiar contraseña
const cambiarContraseña = async (req, res) => {
    const { correo, codigoOtp, nuevaContraseña, confirmarContraseña } = req.body;

    if (nuevaContraseña !== confirmarContraseña) {
        return res.status(400).json({ message: 'Las contraseñas no coinciden' });
    }

    // Obtener el usuario y verificar OTP
    const otpData = await validarOtp(correo, codigoOtp);
    if (!otpData) {
        return res.status(400).json({ message: 'Código OTP inválido, expirado o ya usado' });
    }

    // Obtener el hash de la contraseña del usuario para compararla
    const pool = await IdServicePool;
    const query = `
        SELECT HashPassword 
        FROM USUARIOS 
        WHERE UsuarioID = @usuarioId
    `;
    const result = await pool.request()
        .input('usuarioId', sql.Int, otpData.USUARIO_ID)
        .query(query);

    if (result.recordset.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const hashAlmacenado = result.recordset[0].HashPassword;

    // Comparar la nueva contraseña con la anterior
    const esContraseñaValida = await bcrypt.compare(nuevaContraseña, hashAlmacenado);
    if (esContraseñaValida) {
        return res.status(400).json({ message: 'La nueva contraseña no puede ser la misma que la anterior' });
    }

    // Encriptar la nueva contraseña
    const salt = bcrypt.genSaltSync(10);
    const hashNuevaContraseña = bcrypt.hashSync(nuevaContraseña, salt);

    console.log('Nuevo Hash de Contraseña:', hashNuevaContraseña);

    // Comenzar una transacción para actualizar la contraseña y marcar el OTP
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const request = transaction.request();
        await request.input('hashPassword', sql.NVarChar, hashNuevaContraseña);
        await request.input('usuarioId', sql.Int, otpData.USUARIO_ID);
        
        await request.query(`
            UPDATE USUARIOS
            SET HashPassword = @hashPassword, FechaActualizacion = GETDATE()
            WHERE UsuarioID = @usuarioId;
        `);

        // Marcar OTP como usado (con la función corregida)
        await marcarOtpComoUsado(otpData.USUARIO_ID, codigoOtp);

        // Commit de la transacción
        await transaction.commit();
        res.status(200).json({ message: 'Contraseña cambiada exitosamente' });

    } catch (error) {
        // Si hay algún error, revertimos la transacción
        await transaction.rollback();
        console.error(error);
        res.status(500).json({ message: 'Error al cambiar la contraseña' });
    }
};

const verificarOtpValido = async (req, res) => {
  const { correo, codigoOtp } = req.body;

  if (!correo || !codigoOtp) {
    return res.status(400).json({ message: 'Correo y código OTP son requeridos' });
  }

  try {
    const esValido = await validarSoloOtp(correo, codigoOtp);

    if (!esValido) {
      return res.status(400).json({ message: 'Código OTP inválido, usado o expirado' });
    }

    return res.status(200).json({ message: 'Código OTP válido' });
  } catch (error) {
    console.error('❌ Error al validar OTP:', error);
    res.status(500).json({ message: 'Error al validar el código OTP' });
  }
};
module.exports = {
  login, cerrarSesionController, renovarSesion, solicitarRecuperacionController, cambiarContraseña, verificarOtpValido 
};
