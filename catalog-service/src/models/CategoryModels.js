const { sql, catalogPoolConnect, catalogPool } = require('../config/dbnew');

//MODELS BUSCAR CATEGORIAS
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
//MODELS BUSCAR POR PRIMER NIVEL

const buscarPrimerNivel = async (buscar) => {
  await catalogPoolConnect;

  let query = `
    SELECT Code, Name
    FROM [PRIMERNIVEL]
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
//OBTENER DETALLE CATEGORIAS
const buscarSubcategoriasPorCategoria = async (codigoCategoria) => {
  await catalogPoolConnect;

  const query = `
    SELECT 
      c.Name AS categoria,
      c.Code AS categoria_code,
      p.Name AS primernivel,
      p.Code AS primernivel_code,
      s.Code AS subcategoria_code,
      s.Name AS subcategoria_name,
      s.UpdateDate AS data_modified,
      s.UserId2 AS user_modified,
      s.ValidFor AS status
    FROM SUBCATEGORIA s
    INNER JOIN CATEGORIA c ON s.U_Categoria = c.Code
    INNER JOIN PRIMERNIVEL p ON c.U_Primer_Nivel = p.Code
    WHERE c.Code = @codigo
  `;

  const request = catalogPool.request();
  request.input('codigo', sql.NVarChar, codigoCategoria);

  const result = await request.query(query);
  return result.recordset;
};

// MODELS OBTENER ARBOL DE CATEGORIAS
const obtenerArbolCategoriasDB = async () => {
  await catalogPoolConnect;

  const query = `
    SELECT 
        T1.CODE AS reference,
        T1.NAME AS first_level_name,
        T2.CODE AS category_code,
        T2.NAME AS category_name,
        NULL AS subcategory_code,
        NULL AS subcategory_name,
        T2.UPDATEDATE AS data_modified,
        T2.USERID2 AS user_modified,
        T2.VALIDFOR AS status
    FROM PRIMERNIVEL T1
    JOIN CATEGORIA T2 ON T2.U_PRIMER_NIVEL = T1.CODE

    UNION ALL

    SELECT 
        T1.CODE AS reference,
        T1.NAME AS first_level_name,
        T2.CODE AS category_code,
        T2.NAME AS category_name,
        T3.CODE AS subcategory_code,
        T3.NAME AS subcategory_name,
        T3.UPDATEDATE AS data_modified,
        T3.USERID2 AS user_modified,
        T3.VALIDFOR AS status
    FROM PRIMERNIVEL T1
    JOIN CATEGORIA T2 ON T2.U_PRIMER_NIVEL = T1.CODE
    JOIN SUBCATEGORIA T3 ON T3.U_CATEGORIA = T2.CODE
  `;

  const result = await catalogPool.request().query(query);
  return result.recordset;
};

module.exports = { buscarCategorias, buscarPrimerNivel, obtenerArbolCategoriasDB, buscarSubcategoriasPorCategoria };
