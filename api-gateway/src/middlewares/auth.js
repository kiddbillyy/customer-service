// src/middlewares/auth.js  (ESM)
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { sql, catalogPool, catalogPoolConnect } from '../config/dbnew.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const JWT_SECRET = process.env.JWT_SECRET ;
const CHECK_IP = false;
const CHECK_UA = false;

export default async function auth(req, res, next) {
  const fail = (message, code = 401) =>
    res.status(code).json({
      status: 'error',
      code,
      message,
      timestamp: dayjs().tz('America/Santiago').format('YYYY-MM-DD HH:mm:ss'),
    });

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return fail(
      'Acceso denegado. Debes proporcionar un token válido.'
    );
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return fail(e.name === 'TokenExpiredError' ? 'Token expirado.' : 'Token inválido.');
  }

  if (!payload?.usuarioId || !payload?.plataformaId) {
    return fail('Token inválido (faltan campos requeridos).');
  }

  const usuarioId = payload.usuarioId;
  const plataformaId = payload.plataformaId;

  const plataformaHeader = req.headers['x-plataforma-id'] || req.headers['plataformaid'];
  const plataformaIdPeticion = parseInt(plataformaHeader, 10);

  if (!plataformaIdPeticion || plataformaIdPeticion !== plataformaId) {
    return fail(`Token no coincide con la plataforma esperada. Token: ${plataformaId}, header: ${plataformaIdPeticion}`, 403);
  }


  try {
    await catalogPoolConnect;

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.socket?.remoteAddress
            || null;
    const ua = req.headers['user-agent'] || null;

    const q = `
      SELECT TOP 1 VALIDO, FECHA_EXPIRACION, IP, DISPOSITIVO
      FROM TOKENS_ACTIVOS
      WHERE TOKEN = @token
        AND USUARIO_ID = @uid
        AND PLATAFORMA_ID = @plataformaId
        AND VALIDO = 1
        AND FECHA_EXPIRACION > GETDATE()
    `;

    const rs = await catalogPool
      .request()
      .input('token', sql.NVarChar, token)
      .input('uid', sql.Int, usuarioId)
      .input('plataformaId', sql.Int, plataformaId)
      .query(q);

    if (!rs.recordset.length) {
      return fail('Token no registrado, revocado o expirado.');
    }

    const row = rs.recordset[0];


    if (CHECK_IP && row.IP && ip && row.IP !== ip) {
      return fail('Contexto de sesión inválido (IP).');
    }

    if (CHECK_UA && row.DISPOSITIVO && ua && !ua.includes(row.DISPOSITIVO)) {
      return fail('Contexto de sesión inválido (dispositivo).');
    }

    req.user = {
      usuarioId: payload.usuarioId,
      correo: payload.correo,
      plataformaId: payload.plataformaId
    };
    req.token = token;

    return next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ status: 'error', code: 500, message: 'Error de autenticación.' });
  }
}
