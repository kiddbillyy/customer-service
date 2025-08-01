const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, IdServicePool } = require('../config/dbnew');
require('dotenv').config();

const login = async (req, res) => {
  const { correo, password, plataformaId, ip, dispositivo, forzarSesion = false } = req.body;

  // Validaciones iniciales
  if (!correo || !password || !plataformaId) {
    return res.status(400).json({ error: 'Correo, contraseña y plataformaId son obligatorios.' });
  }

  const pool = await IdServicePool.connect();

  // Buscar usuario por correo
  const usuarioResult = await pool.request()
    .input('Correo', sql.NVarChar(255), correo)
    .query(`SELECT * FROM Usuarios WHERE CorreoElectronico = @Correo`);

  const usuario = usuarioResult.recordset[0];

  if (!usuario) {
    return res.status(401).json({ error: 'Usuario no encontrado.' });
  }

  if (!usuario.Activo) {
    return res.status(403).json({ error: 'El usuario no está activo.' });
  }

  // Validar contraseña
  const esValida = bcrypt.compareSync(password, usuario.HashPassword);
  if (!esValida) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }

  // Verificar acceso activo a la plataforma
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

  // Verificar sesión activa
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

  // Invalidar sesión previa si se forzó
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

  // Generar nuevo JWT
  const payload = {
    usuarioId: usuario.UsuarioID,
    correo: usuario.CorreoElectronico,
    plataformaId: plataformaId
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

  const now = new Date();
  const expiracion = new Date(now.getTime() + 60 * 60 * 1000); // 1 hora

  // Guardar en TOKENS_ACTIVOS
  await pool.request()
    .input('UsuarioID', sql.Int, usuario.UsuarioID)
    .input('PlataformaID', sql.Int, plataformaId)
    .input('Token', sql.NVarChar, token)
    .input('Valido', sql.Bit, 1)
    .input('IP', sql.NVarChar(50), ip ?? null)
    .input('Dispositivo', sql.NVarChar(100), dispositivo ?? null)
    .input('FechaCreacion', sql.DateTime, now)
    .input('FechaExpiracion', sql.DateTime, expiracion)
    .query(`
      INSERT INTO TOKENS_ACTIVOS (
        USUARIO_ID, PLATAFORMA_ID, TOKEN, VALIDO, IP, DISPOSITIVO, FECHA_CREACION, FECHA_EXPIRACION
      )
      VALUES (
        @UsuarioID, @PlataformaID, @Token, @Valido, @IP, @Dispositivo, @FechaCreacion, @FechaExpiracion
      )
    `);

  // Guardar en HISTORIAL_SESIONES
  await pool.request()
    .input('UsuarioID', sql.Int, usuario.UsuarioID)
    .input('PlataformaID', sql.Int, plataformaId)
    .input('FechaInicio', sql.DateTime, now)
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

  // Enviar token al cliente
  res.status(200).json({
    message: 'Inicio de sesión exitoso.',
    token,
    usuarioId: usuario.UsuarioID,
    correo: usuario.CorreoElectronico,
    plataformaId,
    expiracion: expiracion.toISOString()
  });
};

module.exports = {
  login
};
