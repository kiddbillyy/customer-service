const { catalogPool, catalogPoolConnect, sql } = require('../config/dbnew');


const {sapPool,sapPoolConnect} = require('../config/dbnewsap')
const VALID_SORT = [
  'ItemCode',
  'ItemName',
  'Category',
  'U_Marca',
  'UpdatedAt'
];

async function getProducts(opts) {
  await catalogPoolConnect;

  const where = [];
  const req   = catalogPool.request();

  if (opts.itemCode) {
    where.push('P.ItemCode LIKE @itemCode');
    req.input('itemCode', sql.NVarChar(50), `%${opts.itemCode}%`);
  }
  if (opts.name) {
    where.push('P.ItemName LIKE @name');
    req.input('name', sql.NVarChar(100), `%${opts.name}%`);
  }
  if (opts.category) {
    where.push('(P.U_Categoria = @category OR C.Name = @category)');
    req.input('category', sql.NVarChar(200), opts.category);
  }
  if (opts.barcode) {
    where.push('P.CodeBars = @barcode');
    req.input('barcode', sql.NVarChar(254), opts.barcode);
  }
 
  const whereSQL  = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sortBy    = VALID_SORT.includes(opts.sortBy) ? opts.sortBy : 'ItemCode';
  const sortOrder = opts.sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const sqlText = `
    WITH Q AS (
      SELECT
        P.U_Imagen    AS Image,
        P.ItemName    AS Name,
        P.ItemCode    AS ItemCode,
        C.Name        AS Category,
        P.U_Marca     AS Brand,
        CAST(NULL AS INT) AS TotalSalesChannel,
        P.UpdatedAt   AS DateModified,
        P.UserSign    AS UserId,
        CASE P.ValidFor
            WHEN 'Y' THEN 'Activo'
            WHEN 'N' THEN 'Inactivo'
            ELSE P.ValidFor 
        END          AS Status,
        P.CodeBars    AS Eans,
        COUNT(*) OVER() AS totalRecords
      FROM dbo.OITM_Products AS P
      LEFT JOIN dbo.CATEGORIA AS C
             ON C.Code = P.U_Categoria
      ${whereSQL}
    )
    SELECT
      Image, Name, ItemCode, Category, Brand,
      TotalSalesChannel, DateModified,UserId, Status, Eans,
      totalRecords
    FROM Q
    ORDER BY ${sortBy} ${sortOrder}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`;

  req.input('offset',   sql.Int, (opts.page - 1) * opts.pageSize);
  req.input('pageSize', sql.Int,  opts.pageSize);

  const r = await req.query(sqlText);
  console.log('🔍 Productos recibidos desde OMS:', r.recordset);
  /* const totalRecords = r.recordset[0]?.totalRecords ?? 0;
  const data         = r.recordset.map(({ totalRecords, ...row }) => row); */
  const userIds  = [...new Set(r.recordset.map(row => row.UserId).filter(Boolean))];
  console.log('🧾 userIds extraídos:', userIds);
  const userInfo = await getUsersByIds(userIds);
  console.log('📬 userInfo recibido de SAP:', userInfo);
  const userMap  = Object.fromEntries(userIds.map((id, i) => [id, userInfo[i]]));

 
console.log('🗺️ Mapeo final de usuarios (userMap):', userMap);


  const totalRecords = r.recordset[0]?.totalRecords ?? 0;
  const data = r.recordset.map(({ totalRecords, UserId, ...row }) => ({
    ...row,
    CreatedName  : userMap[UserId]?.name  ?? null,
    CreatedEmail : userMap[UserId]?.email ?? null
  }));

  return {
    page: opts.page,
    pageSize: opts.pageSize,
    totalRecords,
    totalPages: Math.ceil(totalRecords / opts.pageSize),
    data
  };
}


async function getProductBySku(itemCode) {
  await catalogPoolConnect;

  const {recordset} = await catalogPool.request()
    .input('itemCode', sql.NVarChar(50), itemCode)
    .query(`
      SELECT
        P.U_Imagen    AS Image,
        P.ItemName    AS Name,
        P.ItemCode    AS SKU,
        C.Name        AS Category,
        P.U_Marca     AS Brand,
        CAST(NULL AS INT) AS TotalSalesChannel,
        P.UpdatedAt   AS DateModified,
        P.UserSign    AS UserId,
        P.ValidFor    AS Status,
        P.CodeBars    AS Eans
      FROM dbo.OITM_Products AS P
      LEFT JOIN dbo.CATEGORIA AS C
             ON C.Code = P.U_Categoria
      WHERE P.ItemCode = @itemCode;
    `);
  const row = recordset[0];
  
  console.log("row",row)
  if (!row) return null;

  console.log('🔎 Resultado de búsqueda por SKU:', recordset);
  const [user] = await getUsersByIds([row.UserId]);
  console.log('👤 Usuario recuperado para SKU:', user);
  return {
    ...row,
    UpdatedByName  : user.name,
    UpdatedByEmail : user.email
  };
}


const usersCache = new Map();
let   cacheUntil = 0;

async function getUsersByIds(ids) {
    console.log("📥 Recibiendo IDs para consulta SAP:", ids);
    await sapPoolConnect;
    const now = Date.now();
    if (now < cacheUntil && ids.every(id => usersCache.has(id))) {
        console.log("🧠 Todos los IDs están en caché. Retornando desde cache...");
        return ids.map(id => usersCache.get(id));
    }

    // consulta SAP solo para los IDs faltantes
    const missing = ids.filter(id => !usersCache.has(id));
    console.log("❗ IDs faltantes que irán a SAP:", missing);
    if (missing.length) {
        const req = sapPool.request();
        missing.forEach((id, idx) => req.input(`id${idx}`, sql.Int, id));
        const inList = missing.map((_, idx) => `@id${idx}`).join(',');

        console.log("📄 Parámetros construidos para consulta SAP:", inList);
        
        const rows = (await req.query(`
        SELECT USERID, U_NAME, E_Mail
        FROM OUSR
        WHERE USERID IN (${inList})
        `)).recordset;

         console.log("📦 Respuesta cruda de SAP (OUSR):", rows);

        rows.forEach(r => usersCache.set(r.USERID, { name: r.U_NAME, email: r.E_Mail }));
    }

    cacheUntil = now + 5 * 60 * 1000; // 5 min de caché

    console.log("🧠 Caché actualizada:", Array.from(usersCache.entries()));

    return ids.map(id => usersCache.get(id) ?? { name: null, email: null });
}



module.exports = {
  getProducts,
  getProductBySku
};
