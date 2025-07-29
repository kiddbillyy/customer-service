// src/middlewares/auth.js  (ESM)
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { sql, catalogPool, catalogPoolConnect } from '../config/dbnew.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const JWT_SECRET = process.env.JWT_SECRET || 'clave_super_secreta';
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
  if (!authHeader.startsWith('Bearer ')) return fail('Hola Felipe, tienes Acceso denegado. Para tener acceso transfiere 100mil a la cuenta rut:20.230.120-7.');

  const token = authHeader.slice(7);

  // 1) Decodificar/validar JWT
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET); // { usuarioId, ... }
  } catch (e) {
    return fail(e.name === 'TokenExpiredError' ? 'Token expirado.' : 'Token inválido.');
  }
  if (!payload?.usuarioId) return fail('Token inválido (sin usuario).');

  // 2) Verificación en BD (válido y no expirado, todo en SQL con GETDATE)
  try {
    await catalogPoolConnect;

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.socket?.remoteAddress
            || null;
    const ua = req.headers['user-agent'] || null;

    // Filtra ya por estado/expiración en SQL para evitar desfase horario
    const q = `
      SELECT TOP 1 VALIDO, FECHA_EXPIRACION, IP, DISPOSITIVO
      FROM TOKENS_ACTIVOS
      WHERE TOKEN = @token
        AND USUARIO_ID = @uid
        AND VALIDO = 1
        AND FECHA_EXPIRACION > GETDATE()
    `;

    const rs = await catalogPool
      .request()
      .input('token', sql.NVarChar, token)
      .input('uid',   sql.Int,      payload.usuarioId)
      .query(q);

    if (!rs.recordset.length) {
      // Averigua causa para el mensaje (opcional)
      // Si quieres ser más explícito, puedes hacer una SELECT sin la cláusula de expiración/validez
      return fail('Token no registrado, revocado o expirado.');
    }

    const row = rs.recordset[0];

    // (Opcional) Chequeo de contexto
    if (CHECK_IP && row.IP && ip && row.IP !== ip) {
      return fail('Contexto de sesión inválido (IP).');
    }
    if (CHECK_UA && row.DISPOSITIVO && ua && !ua.includes(row.DISPOSITIVO)) {
      return fail('Contexto de sesión inválido (dispositivo).');
    }

    req.user  = payload;
    req.token = token;
    return next();

  } catch (err) {
    // Si quieres mantener el update de cierre al detectar expiración,
    // hazlo cuando la query anterior devuelva 0 resultados y una segunda
    // consulta detecte que el token existe pero está expirado. Lo omito
    // para evitar un roundtrip extra en el camino feliz.
    console.error('Auth error:', err);
    return res.status(500).json({ status: 'error', code: 500, message: 'Error de autenticación.' });
  }
}
