const { catalogPool, sql } = require('../config/dbnew');

async function getMarcas({ page, pageSize, code, name, fromDate, toDate }) {
  await catalogPool.connect();
  const req = catalogPool.request();

  // --- Lógica de Filtros ---
  const where = [];

  if (code) {
    where.push('Code LIKE @code');
    req.input('code', sql.NVarChar(50), `%${code}%`);
  }

  if (name) {
    where.push('Name LIKE @name');
    req.input('name', sql.NVarChar(100), `%${name}%`);
  }

  if (fromDate) {
    where.push('CreateDate >= @fromDate');
    req.input('fromDate', sql.DateTime, new Date(fromDate));
  }

  if (toDate) {
    where.push('CreateDate <= @toDate');
    req.input('toDate', sql.DateTime, new Date(toDate));
  }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // --- Lógica de Paginación ---
  const offset = (page - 1) * pageSize;
  
  // Input para el offset y el tamaño de página
  req.input('offset', sql.Int, offset);
  req.input('pageSize', sql.Int, pageSize);

  const query = `
    WITH Q AS (
      SELECT *,
             COUNT(*) OVER() AS totalRecords
      FROM dbo.MARCA
      ${whereSQL}
    )
    SELECT *
    FROM Q
    ORDER BY CreateDate DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  const result = await req.query(query);
  
  const totalRecords = result.recordset[0]?.totalRecords ?? 0;
  const data = result.recordset.map(({ totalRecords, ...row }) => row);

  return {
    page,
    pageSize,
    totalRecords,
    totalPages: Math.ceil(totalRecords / pageSize),
    data
  };
}

module.exports = { getMarcas };