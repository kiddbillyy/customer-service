const { sql, catalogPoolConnect, catalogPool } = require('../config/dbnew');

const buscarCategorias = async (buscar) => {
  await catalogPoolConnect;

  let query = `
    SELECT Code, Name
    FROM [CATEGORIA]
  `;

  const request = catalogPool.request();

  if (buscar) {
    query += `
      WHERE CAST(Code AS NVARCHAR) COLLATE Latin1_General_CI_AI LIKE @buscar
         OR CAST(Name AS NVARCHAR) COLLATE Latin1_General_CI_AI LIKE @buscar
    `;
    request.input('buscar', sql.NVarChar, `%${buscar}%`);
  }

  const result = await request.query(query);
  return result.recordset;
};



module.exports = { buscarCategorias };
