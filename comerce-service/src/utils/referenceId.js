// utils/referenceId.js
const { sql } = require('../config/dbnew');

// Por seguridad, solo permitimos tablas conocidas:
const ALLOWED_TABLES = new Set(['Company', 'Sales_Channel']);

/**
 * Limpia texto y arma un prefijo de N letras (default 3)
 * - quita acentos/diacríticos
 * - deja solo A-Z
 * - uppercase + pad con 'X'
 */
function buildPrefix(value = '', letters = 3) {
  const onlyLetters = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');

  return (onlyLetters.slice(0, letters).toUpperCase() || '').padEnd(letters, 'X');
}

/**
 * Obtiene el próximo ReferenceId `${prefix}-NNN` para la tabla dada,
 * con locks para evitar carreras en concurrencia.
 *
 * @param {sql.Transaction} tx - Transacción activa de mssql
 * @param {string} tableName - 'Company' | 'Sales_Channel'
 * @param {string} prefix - prefijo ya calculado (p.ej. 'EMP', 'MAR')
 * @param {number} width - ancho de la parte numérica (default 3 => 001, 002, ...)
 * @returns {Promise<string>} p.ej. 'EMP-001'
 */
async function getNextReferenceId(tx, tableName, prefix, width = 3) {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Tabla no permitida: ${tableName}`);
  }

  const req = new sql.Request(tx);
  req.input('prefix', sql.VarChar(10), prefix);

  const q = `
    SELECT MAX(TRY_CONVERT(int, PARSENAME(REPLACE(ReferenceId, '-', '.'), 1))) AS maxSeq
    FROM ${tableName} WITH (UPDLOCK, HOLDLOCK)
    WHERE ReferenceId LIKE @prefix + '-%';
  `;

  const rs = await req.query(q);
  const maxSeq = rs.recordset[0]?.maxSeq || 0;
  const nextSeq = maxSeq + 1;
  const code = String(nextSeq).padStart(width, '0');

  return `${prefix}-${code}`;
}

module.exports = { buildPrefix, getNextReferenceId };
