// src/models/rolesModels.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

async function getReq(conn) {
  if (conn && typeof conn.request === 'function') {
    return conn.request();
  }
  await IdServicePoolConnect;

  // Validar que el pool tenga .request()
  if (!IdServicePool || typeof IdServicePool.request !== 'function') {
    throw new Error('IdServicePool no es un pool de mssql válido (falta .request).');
  }

  return IdServicePool.request();
}

/** Devuelve true si el usuario tiene AL MENOS un rol que contenga "VENDEDOR" (case-insensitive) */
async function userHasSellerRole(usuarioId, conn) {
  const req = await getReq(conn);
  const { recordset } = await req
    .input('usuarioId', sql.Int, usuarioId)
    .query(`
      SELECT 1
      FROM USUARIO_ROL UR
      JOIN ROLES R ON R.ID = UR.ROL_ID
      WHERE UR.USUARIO_ID = @usuarioId
        AND (R.ACTIVO = 1 OR R.ACTIVO IS NULL)
        AND UPPER(R.NOMBRE) LIKE '%VENDEDOR%'
    `);

  return recordset.length > 0;
}

/** Trae datos básicos del usuario para armar payload Kafka */
async function getUsuarioDatosBasicos(usuarioId, conn) {
  const req = await getReq(conn);
  const { recordset } = await req
    .input('usuarioId', sql.Int, usuarioId)
    .query(`
      SELECT 
        U.UsuarioID           AS usuarioId,
        U.CorreoElectronico    AS correoElectronico,
        P.NOMBRES           AS nombres,
        P.APELLIDOS         AS apellidos,
        P.RUT               AS rut,
        P.TELEFONO          AS telefono,
        p.CanalDeVenta              AS canalDeVenta,
        p.CanalDeVentaId            AS canalDeVentaId
      FROM USUARIOS U
      LEFT JOIN PERFILES P ON P.UsuarioID = U.UsuarioID
      WHERE U.UsuarioID = @usuarioId
    `);

  return recordset[0] || null;
}

module.exports = { userHasSellerRole, getUsuarioDatosBasicos };
