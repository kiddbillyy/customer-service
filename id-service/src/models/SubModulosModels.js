// models/SubModuloModel.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

/**
 * Crea un nuevo submódulo.
 * @param {object} subModuloData - Datos del submódulo a crear.
 * @param {number} subModuloData.moduloId - ID del módulo al que pertenece el submódulo.
 * @param {string} subModuloData.nombre - Nombre del submódulo.
 * @param {string} subModuloData.codigo - Código único del submódulo (ej. 'PROD_MNGT_CATALOGO').
 * @param {string} [subModuloData.descripcion] - Descripción del submódulo (opcional).
 * @returns {Promise<object>} Objeto con el ID del submódulo creado.
 */
async function createSubModulo({ moduloId, nombre, codigo, descripcion }) {
  await IdServicePoolConnect;
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const moduloExist = (await tx.request()
      .input('modId', sql.Int, moduloId)
      .query(`SELECT ID FROM MODULOS_PLATAFORMA WHERE ID = @modId`)
    ).recordset[0];
    if (!moduloExist) {
      throw new Error('MODULE_NOT_FOUND');
    }

    const subModuloExist = (await tx.request()
      .input('cod', sql.NVarChar(50), codigo)
      .query(`SELECT ID FROM SUBMODULOS WHERE CODIGO = @cod`)
    ).recordset[0];
    if (subModuloExist) {
      throw new Error('SUBMODULE_CODE_EXISTS');
    }

    const result = await tx.request()
      .input('mId', sql.Int, moduloId)
      .input('n', sql.NVarChar(100), nombre)
      .input('c', sql.NVarChar(50), codigo)
      .input('d', sql.NVarChar(255), descripcion)
      .query(`
        INSERT INTO SUBMODULOS (MODULO_ID, NOMBRE, CODIGO, DESCRIPCION)
        OUTPUT INSERTED.ID
        VALUES (@mId, @n, @c, @d);
      `);

    const newSubModuloId = result.recordset[0].ID;

    await tx.commit();
    return { subModuloId: newSubModuloId };

  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { createSubModulo };