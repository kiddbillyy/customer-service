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

module.exports = { createEndpointApi };