// src/models/sellerModel.js
const { sql, IdServicePool, IdServicePoolConnect } = require('../config/dbnew');
const { toRutPlain } = require('../utils/rut');

function buildOrderClause(orderBy = 'createdAt', orderDir = 'desc') {
  const dir = (String(orderDir).toLowerCase() === 'asc') ? 'ASC' : 'DESC';
  switch (orderBy) {
    case 'name':
      return `NOMBRE_COMPLETO ${dir}`;
    case 'createdAt':
    default:
      return `FECHA_CREACION ${dir}`;
  }
}

async function querySellers({
  q,
  statusIds,
  statusNames,
  page = 1,
  pageSize = 20,
  orderBy = 'createdAt',
  orderDir = 'desc',
}) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 200);
  const offset = (safePage - 1) * size;

  const qStr = (q ?? '').trim();
  const qLike = qStr ? `%${qStr.toUpperCase()}%` : null;


  const rutPlainTerm = qStr ? toRutPlain(qStr) : '';
  const qRutPlain = rutPlainTerm ? `%${rutPlainTerm}%` : null;

  const statusIdsCsv = (statusIds ?? '').trim() || null;       
  const statusNamesCsv = (statusNames ?? '').trim() || null;  

  const orderSql = buildOrderClause(orderBy, orderDir);

  await IdServicePoolConnect;
  const reqDb = IdServicePool.request();

  reqDb
    .input('q', sql.NVarChar, qLike)
    .input('qRutPlain', sql.NVarChar, qRutPlain)
    .input('statusIdsCsv', sql.NVarChar, statusIdsCsv)
    .input('statusNamesCsv', sql.NVarChar, statusNamesCsv)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, size);

  const { recordset } = await reqDb.query(`
    WITH BASE AS (
      SELECT
        S.ID,
        S.FECHA_CREACION,
        LTRIM(RTRIM(CONCAT(COALESCE(S.NOMBRE, ''), ' ', COALESCE(S.APELLIDO, '')))) AS NOMBRE_COMPLETO,
        S.EMAIL,
        S.TELEFONO,
        S.RUT,
        S.EXTERNAL_SAP_ID,
        SS.NOMBRE AS STATUS_NOMBRE,
        COUNT(1) OVER() AS TOTAL_ROWS
      FROM SELLER S
      LEFT JOIN SELLER_STATUS SS ON SS.ID = S.STATUS_ID
      WHERE 1 = 1
        AND (
          @q IS NULL
          OR (
            UPPER(S.NOMBRE) LIKE @q
            OR UPPER(S.APELLIDO) LIKE @q
            OR UPPER(S.EMAIL) LIKE @q
            OR UPPER(S.TELEFONO) LIKE @q
            OR UPPER(S.EXTERNAL_SAP_ID) LIKE @q
            -- ❗ FIX: solo aplicar condición de RUT si @qRutPlain NO es NULL
            OR (
              @qRutPlain IS NOT NULL AND
              UPPER(REPLACE(REPLACE(S.RUT, '.', ''), '-', '')) LIKE @qRutPlain
            )
          )
        )
        AND (
          @statusIdsCsv IS NULL
          OR S.STATUS_ID IN (
            SELECT TRY_CAST(value AS INT)
            FROM string_split(@statusIdsCsv, ',')
            WHERE TRY_CAST(value AS INT) IS NOT NULL
          )
        )
        AND (
          @statusNamesCsv IS NULL
          OR SS.NOMBRE IN (
            SELECT LTRIM(RTRIM(value))
            FROM string_split(@statusNamesCsv, ',')
          )
        )
    )
    SELECT *
    FROM BASE
    ORDER BY ${orderSql}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);

  const total = recordset[0]?.TOTAL_ROWS ?? 0;
  return { total, rows: recordset, page: safePage, pageSize: size, offset };
}

async function querySellerStatuses() {
  await IdServicePoolConnect;
  const { recordset } = await IdServicePool.request().query(`
    SELECT ID AS id, NOMBRE AS name, ACTIVO AS active
    FROM SELLER_STATUS
    ORDER BY NOMBRE ASC
  `);
  return recordset;
}
async function getSellerByRut(rutInput) {
  const rutPlain = toRutPlain(rutInput);
  if (!rutPlain) return null;

  await IdServicePoolConnect;

  const { recordset } = await IdServicePool.request()
    .input('rutPlain', sql.NVarChar, rutPlain)
    .query(`
      SELECT TOP 1
        LTRIM(RTRIM(CONCAT(COALESCE(S.NOMBRE, ''), ' ', COALESCE(S.APELLIDO, '')))) AS name,
        S.EXTERNAL_SAP_ID AS external_sap_id,
        SS.NOMBRE AS status
      FROM SELLER S
      LEFT JOIN SELLER_STATUS SS ON SS.ID = S.STATUS_ID
      WHERE S.RUT = @rutPlain
         OR REPLACE(REPLACE(S.RUT, '.', ''), '-', '') = @rutPlain
      ORDER BY CASE WHEN S.RUT = @rutPlain THEN 0 ELSE 1 END, S.ID ASC
    `);

  return recordset[0] || null;
}

module.exports = { querySellers, querySellerStatuses, getSellerByRut };
