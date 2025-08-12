const { catalogPool, catalogPoolConnect, sql } = require('../config/dbnew');
const { sapPool } = require('../config/dbnewsap');

const VALID_SORT = ['ItemCode', 'PriceList', 'Price', 'PriceIVA', 'CreatedAt', 'UpdatedAt'];

async function getLatestCostsFromSAP(itemCodes) {
  if (!itemCodes || itemCodes.length === 0) return {};

  const pool = await sapPool.connect();
  const request = pool.request();

  const inClause = itemCodes.map((_, i) => `@item${i}`).join(',');
  itemCodes.forEach((code, i) => request.input(`item${i}`, sql.NVarChar(50), code));

  const query = `
    WITH UltimosCostos AS (
      SELECT
        T1.ItemCode,
        T1.Price,
        ROW_NUMBER() OVER (PARTITION BY T1.ItemCode ORDER BY T0.DocDate DESC, T0.DocTime DESC) AS RN
      FROM OPDN T0
      JOIN PDN1 T1 ON T0.DocEntry = T1.DocEntry
      WHERE T0.CANCELED = 'N'
        AND T1.ItemCode IN (${inClause})
    )
    SELECT ItemCode, Price
    FROM UltimosCostos
    WHERE RN = 1;
  `;

  const result = await request.query(query);

  const map = {};
  for (const row of result.recordset) {
    map[row.ItemCode] = Number(row.Price);
  }

  return map;
}

async function getListPrices(opts) {
  await catalogPoolConnect;

  const where = [];
  const req = catalogPool.request();
  const priceIvaExpr = `CAST(CASE WHEN P.TaxCodeAR = 'IVA_EXE' THEN L.Price ELSE L.Price * 1.19 END AS NUMERIC(19,6))`;

  if (opts.itemCode) {
    where.push('(L.ItemCode LIKE @itemCode OR P.ItemName LIKE @itemCode)');
    req.input('itemCode', sql.NVarChar(100), `%${opts.itemCode}%`);
  }

  if (opts.price != null) {
    where.push('L.Price = @price');
    req.input('price', sql.Numeric(19, 6), opts.price);
  }

  if (opts.priceIVA != null) {
    where.push(`${priceIvaExpr} = @priceIVA`);
    req.input('priceIVA', sql.Numeric(19, 6), opts.priceIVA);
  }

  if (opts.priceList != null) {
    where.push('L.PriceList = @priceList');
    req.input('priceList', sql.SmallInt, opts.priceList);
  }

  if (opts.minPrice != null) {
    where.push('L.Price >= @minPrice');
    req.input('minPrice', sql.Numeric(19, 6), opts.minPrice);
  }

  if (opts.maxPrice != null) {
    where.push('L.Price <= @maxPrice');
    req.input('maxPrice', sql.Numeric(19, 6), opts.maxPrice);
  }

  where.push(`P.ValidFor = 'Y'`);

  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sortBy = VALID_SORT.includes(opts.sortBy) ? opts.sortBy : 'ItemCode';
  const sortOrder = opts.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const sqlText = `
    WITH Q AS (
      SELECT  L.ItemCode,
              L.PriceList,
              L.Price,
              ${priceIvaExpr} AS PriceIVA,
              L.CreatedAt,
              L.UpdatedAt,
              P.ItemName,
              P.MinLevel  AS MinQuantity,
              P.ValidFrom AS DateFrom,
              CASE WHEN P.ValidFor = 'Y' THEN 'Active' ELSE 'Inactive' END AS Status,
              P.ValidTo   AS DateTo,
              P.UpdatedAt AS DateModified,
              COUNT(*) OVER() AS totalRecords
      FROM dbo.ITM1_ListPrice  AS L
      JOIN dbo.OITM_Products   AS P ON P.ItemCode = L.ItemCode
      ${whereSQL}
    )
    SELECT ItemCode, PriceList, Price, PriceIVA,
           CreatedAt, UpdatedAt,
           ItemName, MinQuantity, DateFrom, DateTo, DateModified, Status,
           totalRecords
    FROM Q
    ORDER BY ${sortBy} ${sortOrder}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  req.input('offset', sql.Int, (opts.page - 1) * opts.pageSize);
  req.input('pageSize', sql.Int, opts.pageSize);

  const r = await req.query(sqlText);
  const totalRecords = r.recordset[0]?.totalRecords ?? 0;
  const data = r.recordset.map(({ totalRecords, ...row }) => row);

  // Obtener precios de costo desde SAP
  const itemCodes = data.map(d => d.ItemCode);
  const costoMap = await getLatestCostsFromSAP(itemCodes);

  // Agregar CostPrice y MarginPercent
  const dataWithExtras = data.map(row => {
    const price = parseFloat(row.Price);
    const cost = costoMap[row.ItemCode] ?? null;

    let margin = null;
    if (cost !== null && price > 0) {
      margin = ((price - cost) / price) * 100;
    }

    return {
      ...row,
      CostPrice: cost,
      MarginPercent: margin !== null ? parseFloat(margin.toFixed(2)) : null
    };
  });

  return {
    page: opts.page,
    pageSize: opts.pageSize,
    totalRecords,
    totalPages: Math.ceil(totalRecords / opts.pageSize),
    data: dataWithExtras
  };
}

async function getListPriceById(itemCode, priceList) {
  await catalogPoolConnect;
  const result = await catalogPool.request()
    .input('itemCode', sql.NVarChar(50), itemCode)
    .input('priceList', sql.SmallInt, priceList)
    .query(`
      SELECT  L.ItemCode,
            L.PriceList,
            L.Price,
            CAST(CASE WHEN P.TaxCodeAR = 'IVA_EXE' THEN L.Price ELSE L.Price * 1.19 END AS NUMERIC(19,6)) AS PriceIVA,
            L.CreatedAt,
            L.UpdatedAt,
            P.ItemName,
            P.MinLevel  AS MinQuantity,
            P.ValidFrom AS DateFrom,
            P.ValidTo   AS DateTo,
            P.UpdatedAt AS DateModified
    FROM dbo.ITM1_ListPrice  AS L
    JOIN dbo.OITM_Products   AS P ON P.ItemCode = L.ItemCode
    WHERE L.ItemCode = @itemCode
      AND L.PriceList = @priceList;
    `);
  return result.recordset[0] ?? null;
}

module.exports = {
  getListPrices,
  getListPriceById
};


