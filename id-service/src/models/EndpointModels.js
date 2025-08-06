// models/EndpointApiModel.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

/**
 * Crea un nuevo endpoint de API.
 * @param {object} endpointData - Datos del endpoint a crear.
 * @param {number} endpointData.subModuloId - ID del submódulo al que pertenece el endpoint.
 * @param {string} endpointData.metodoHttp - Método HTTP del endpoint (ej. 'GET', 'POST', '*').
 * @param {string} endpointData.path - Ruta del endpoint (ej. '/api/users').
 * @param {string} [endpointData.target] - URL del servicio de destino (opcional).
 * @param {boolean} [endpointData.activo] - Estado del endpoint (por defecto, true).
 * @returns {Promise<object>} Objeto con el ID del endpoint creado.
 */
async function createEndpointApi({ subModuloId, metodoHttp, path, target, activo = true }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const subModuloExist = (await tx.request()
      .input('subModId', sql.Int, subModuloId)
      .query(`SELECT ID FROM SUBMODULOS WHERE ID = @subModId`)
    ).recordset[0];
    if (!subModuloExist) {
      throw new Error('SUBMODULE_NOT_FOUND');
    }

    const endpointExist = (await tx.request()
      .input('metodo', sql.NVarChar(8), metodoHttp)
      .input('path', sql.NVarChar(255), path)
      .query(`SELECT ID FROM ENDPOINTS_API WHERE METODO_HTTP = @metodo AND PATH = @path`)
    ).recordset[0];
    if (endpointExist) {
      throw new Error('ENDPOINT_PATH_EXISTS');
    }

    const result = await tx.request()
      .input('sId', sql.Int, subModuloId)
      .input('met', sql.NVarChar(8), metodoHttp)
      .input('p', sql.NVarChar(255), path)
      .input('t', sql.NVarChar(255), target)
      .input('a', sql.Bit, activo)
      .query(`
        INSERT INTO ENDPOINTS_API (SUBMODULO_ID, METODO_HTTP, PATH, TARGET, ACTIVO)
        OUTPUT INSERTED.ID
        VALUES (@sId, @met, @p, @t, @a);
      `);

    const newEndpointId = result.recordset[0].ID;

    await tx.commit();
    return { endpointId: newEndpointId };

  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Obtiene todos los endpoints de API, sin filtros.
 * @returns {Promise<Array<object>>} Un array con todos los endpoints.
 */
async function getAllEndpoints() {
    try {
        await IdServicePoolConnect;
        const result = await IdServicePool.request().query('SELECT * FROM ENDPOINTS_API');
        return result.recordset;
    } catch (err) {
        console.error('Error fetching all endpoints:', err);
        throw err;
    }
}


/**
 * Devuelve la lista de endpoints (método + path + target) que
 * un usuario puede invocar en una plataforma.
 *
 * @param {number} usuarioId
 * @param {number} plataformaId
 * @returns {Promise<Array<{ subModuloId, metodoHttp, path, target }>>}
 */
async function getAllowedEndpoints({ usuarioId, plataformaId }) {
  if (!Number.isInteger(usuarioId) || !Number.isInteger(plataformaId)) {
    throw new Error('INVALID_PARAMS');
  }

  await IdServicePoolConnect;

  const { recordset } = await IdServicePool.request()
    .input('uid', sql.Int, usuarioId)
    .input('pid', sql.Int, plataformaId)
    .query(`
      WITH RolesUsuario AS (
        SELECT ur.ROL_ID
        FROM   USUARIO_ROL        ur
        JOIN   USUARIO_PLATAFORMA up
               ON up.USUARIO_ID    = ur.USUARIO_ID
              AND up.PLATAFORMA_ID = @pid
              AND up.ACTIVO        = 1
        WHERE  ur.USUARIO_ID = @uid
          AND  ur.ACTIVO     = 1
      ),
      PermisosPorRol AS (
        SELECT rsa.SUBMODULO_ID, rsa.ACCION_ID
        FROM   ROL_SUBMODULO_ACCION rsa
        JOIN   RolesUsuario         ru ON ru.ROL_ID = rsa.ROL_ID
        WHERE  rsa.ACTIVO = 1
      ),
      PermisosDirectos AS (
        SELECT SUBMODULO_ID, ACCION_ID
        FROM   USUARIO_SUBMODULO_ACCION
        WHERE  USUARIO_ID = @uid
          AND  ACTIVO     = 1
      ),
      PermisosEfectivos AS (
        SELECT * FROM PermisosPorRol
        UNION ALL
        SELECT * FROM PermisosDirectos
      )
      SELECT DISTINCT
             e.SUBMODULO_ID AS subModuloId,
             e.METODO_HTTP  AS metodoHttp,
             e.PATH         AS path,
             e.TARGET       AS target
      FROM   ENDPOINTS_API     e
      JOIN   PermisosEfectivos p
             ON p.SUBMODULO_ID = e.SUBMODULO_ID
      WHERE  e.ACTIVO = 1
        AND (
              (p.ACCION_ID = 1 AND e.METODO_HTTP = 'GET')
           OR (p.ACCION_ID = 2 AND e.METODO_HTTP = 'POST')
           OR (p.ACCION_ID = 3 AND e.METODO_HTTP IN ('PUT','PATCH'))
           OR (p.ACCION_ID = 4 AND e.METODO_HTTP = 'DELETE')
        )
        AND EXISTS (
              SELECT 1
              FROM   SUBMODULOS s
              JOIN   MODULOS_PLATAFORMA mp ON mp.ID = s.MODULO_ID
              WHERE  s.ID = e.SUBMODULO_ID
                AND  mp.PLATAFORMA_ID = @pid
        )
      ORDER BY e.PATH, e.METODO_HTTP;
    `);

  return recordset;
}

module.exports = { createEndpointApi, getAllEndpoints, getAllowedEndpoints };