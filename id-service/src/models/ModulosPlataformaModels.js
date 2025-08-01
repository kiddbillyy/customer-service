// models/ModuloPlataformaModel.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

/**
 * Crea un nuevo módulo de plataforma.
 * @param {object} moduloData - Datos del módulo a crear.
 * @param {number} moduloData.plataformaId - ID de la plataforma a la que pertenece el módulo.
 * @param {string} moduloData.nombre - Nombre del módulo.
 * @param {string} moduloData.codigo - Código del módulo (debe ser único).
 * @param {string} [moduloData.ruta] - Ruta del módulo (opcional).
 * @returns {Promise<object>} Objeto con el ID del módulo creado.
 */
async function createModuloPlataforma({ plataformaId, nombre, codigo, ruta }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    // 1. Validar que la plataformaId exista
    const platExist = (await tx.request()
      .input('platId', sql.Int, plataformaId)
      .query(`SELECT ID FROM PLATAFORMAS WHERE ID = @platId`)
    ).recordset[0];
    if (!platExist) {
      throw new Error('PLATFORM_NOT_FOUND');
    }

    // 2. Validar si el código del módulo ya existe para esta plataforma
    const moduloExist = (await tx.request()
      .input('platId', sql.Int, plataformaId)
      .input('cod', sql.NVarChar(50), codigo)
      .query(`SELECT ID FROM MODULOS_PLATAFORMA WHERE PLATAFORMA_ID = @platId AND CODIGO = @cod`)
    ).recordset[0];
    if (moduloExist) {
      throw new Error('MODULE_CODE_EXISTS');
    }

    // 3. Insertar el nuevo módulo
    const result = await tx.request()
      .input('pId', sql.Int, plataformaId)
      .input('n', sql.NVarChar(50), nombre)
      .input('c', sql.NVarChar(50), codigo)
      .input('r', sql.NVarChar(255), ruta)
      .query(`
        INSERT INTO MODULOS_PLATAFORMA (PLATAFORMA_ID, NOMBRE, CODIGO, RUTA)
        OUTPUT INSERTED.ID
        VALUES (@pId, @n, @c, @r);
      `);

    const newModuloId = result.recordset[0].ID;

    await tx.commit();
    return { moduloPlataformaId: newModuloId };

  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { createModuloPlataforma };