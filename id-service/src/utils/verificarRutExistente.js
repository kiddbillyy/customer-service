// src/utils/validaciones.js
const { sql, IdServicePool } = require('../config/dbnew');

/**
 * Verifica si un RUT ya existe en la tabla Perfiles
 * @param {string} rut - El RUT a verificar
 * @returns {Promise<boolean>} - true si existe, false si no
 */
const verificarRutExistente = async (rut) => {
  const pool = await IdServicePool.connect();
  const result = await pool.request()
    .input('RUT', sql.NVarChar(20), rut)
    .query('SELECT 1 FROM Perfiles WHERE RUT = @RUT');
  return result.recordset.length > 0;
};

module.exports = {
  verificarRutExistente
};
