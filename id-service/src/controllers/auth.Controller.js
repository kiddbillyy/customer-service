const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, IdServicePool } = require('../config/dbnew');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { cerrarSesion, validarCredencialesParaRenovar } = require('../models/authModels');
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
    .query(`SELECT * FROM Usuarios WHERE CorreoElectronico = @Correo`);

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
      WHERE USUARIO_ID = @UsuarioID AND PLATAFORMA_ID = @PlataformaID AND VALIDO = 1
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

  const payload = {
    usuarioId: usuario.UsuarioID,
    correo: usuario.CorreoElectronico,
    plataformaId: plataformaId
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7h' });

  // Hora de Santiago como string plano para SQL Server
  const nowSantiago = dayjs().tz('America/Santiago');
  const expiracionSantiago = nowSantiago.add(7, 'hour');

  const nowFormatted = nowSantiago.format('YYYY-MM-DD HH:mm:ss');
  const expiracionFormatted = expiracionSantiago.format('YYYY-MM-DD HH:mm:ss');

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

  await pool.request()
    .input('UsuarioID', sql.Int, usuario.UsuarioID)
    .input('PlataformaID', sql.Int, plataformaId)
    .input('FechaInicio', sql.DateTime, nowFormatted)
    .input('Token', sql.NVarChar, token)
    .input('IP', sql.NVarChar(50), ip ?? null)
    .input('Dispositivo', sql.NVarChar(100), dispositivo ?? null)
    .query(`
      INSERT INTO HISTORIAL_SESIONES (
        USUARIO_ID,
        PLATAFORMA_ID,
        FECHA_INICIO,
        TOKEN,
        IP,
        DISPOSITIVO
      )
      VALUES (
        @UsuarioID,
        @PlataformaID,
        @FechaInicio,
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
      return res.status(401).json({ error: 'Token no proporcionado o inválido.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'La contraseña es requerida.' });
    }

    const tokenAnterior = authHeader.slice(7);
    let payload;

    try {
      payload = jwt.verify(tokenAnterior, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    const { correo, plataformaId } = payload;

    if (!correo || !plataformaId) {
      return res.status(400).json({ error: 'El token no contiene los datos necesarios.' });
    }

    const usuario = await validarCredencialesParaRenovar(correo, password);
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const usuarioId = usuario.UsuarioID;
    const pool = await IdServicePool.connect();
    const nowSantiago = dayjs().tz('America/Santiago');
    const expiracionSantiago = nowSantiago.add(3, 'hour');

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Invalidar tokens anteriores
      const invalidateReq = transaction.request();
      await invalidateReq
        .input('usuarioId', sql.Int, usuarioId)
        .input('plataformaId', sql.Int, plataformaId)
        .query(`
          UPDATE TOKENS_ACTIVOS
          SET VALIDO = 0
          WHERE USUARIO_ID = @usuarioId AND PLATAFORMA_ID = @plataformaId AND VALIDO = 1;
        `);

      // 2. Marcar cierre en historial para el token anterior
      const cerrarHistorialReq = transaction.request();
      await cerrarHistorialReq
        .input('tokenAnterior', sql.NVarChar, tokenAnterior)
        .input('fechaCierre', sql.DateTime, nowSantiago.toDate())
        .query(`
          UPDATE HISTORIAL_SESIONES
          SET FECHA_CIERRE = @fechaCierre,
              CERRADA_MANUALMENTE = 1
          WHERE TOKEN = @tokenAnterior;
        `);

      // 3. Generar nuevo token
      const nuevoPayload = { usuarioId, correo, plataformaId };
      const nuevoToken = jwt.sign(nuevoPayload, process.env.JWT_SECRET, { expiresIn: '3h' });

      // 4. Insertar nuevo token en TOKENS_ACTIVOS
      const insertarTokenReq = transaction.request();
      await insertarTokenReq
        .input('UsuarioID', sql.Int, usuarioId)
        .input('PlataformaID', sql.Int, plataformaId)
        .input('Token', sql.NVarChar, nuevoToken)
        .input('Valido', sql.Bit, 1)
        .input('IP', sql.NVarChar(50), req.ip ?? null)
        .input('Dispositivo', sql.NVarChar(100), req.headers['user-agent'] ?? null)
        .input('FechaCreacion', sql.DateTime, nowSantiago.toDate())
        .input('FechaExpiracion', sql.DateTime, expiracionSantiago.toDate())
        .query(`
          INSERT INTO TOKENS_ACTIVOS (
            USUARIO_ID, PLATAFORMA_ID, TOKEN, VALIDO, IP, DISPOSITIVO, FECHA_CREACION, FECHA_EXPIRACION
          )
          VALUES (
            @UsuarioID, @PlataformaID, @Token, @Valido, @IP, @Dispositivo, @FechaCreacion, @FechaExpiracion
          );
        `);

      // 5. Registrar en HISTORIAL_SESIONES
      const historialReq = transaction.request();
      await historialReq
        .input('UsuarioID', sql.Int, usuarioId)
        .input('PlataformaID', sql.Int, plataformaId)
        .input('FechaInicio', sql.DateTime, nowSantiago.toDate())
        .input('Token', sql.NVarChar, nuevoToken)
        .input('IP', sql.NVarChar(50), req.ip ?? null)
        .input('Dispositivo', sql.NVarChar(100), req.headers['user-agent'] ?? null)
        .query(`
          INSERT INTO HISTORIAL_SESIONES (
            USUARIO_ID, PLATAFORMA_ID, FECHA_INICIO, TOKEN, IP, DISPOSITIVO
          )
          VALUES (
            @UsuarioID, @PlataformaID, @FechaInicio, @Token, @IP, @Dispositivo
          );
        `);

      await transaction.commit();

      return res.status(200).json({
        message: 'Sesión renovada correctamente.',
        token: nuevoToken,
        expiracion: expiracionSantiago.toISOString()
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    console.error('Error al renovar sesión:', error);
    return res.status(500).json({ error: 'Error al renovar sesión.' });
  }
};

module.exports = {
  login, cerrarSesionController, renovarSesion 
};
