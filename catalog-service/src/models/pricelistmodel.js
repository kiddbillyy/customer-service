
const { catalogPool, catalogPoolConnect, sql } = require('../config/dbnew');

const VALID_SORT = ['ItemCode','PriceList','Price','PriceIVA','CreatedAt','UpdatedAt'];

async function getListPrices(opts){
  await catalogPoolConnect;

  const where = [];
  const req = catalogPool.request();
  const priceIvaExpr = `CAST(CASE WHEN P.TaxCodeAR = 'IVA_EXE' THEN L.Price ELSE L.Price * 1.19 END AS NUMERIC(19,6))`;

  if (opts.itemCode){
    where.push('L.ItemCode LIKE @itemCode');
    req.input('itemCode', sql.NVarChar(50), `%${opts.itemCode}%`);
  }
  if (opts.price != null) {
    where.push('L.Price = @price');
    req.input('price', sql.Numeric(19,6), opts.price);
  }
  if (opts.priceIVA != null) {
    where.push(`${priceIvaExpr} = @priceIVA`);
    req.input('priceIVA', sql.Numeric(19,6), opts.priceIVA);
  }
  if (opts.priceList != null){
    where.push('L.PriceList = @priceList');
    req.input('priceList', sql.SmallInt, opts.priceList);
  }
  if (opts.minPrice != null){
    where.push('L.Price >= @minPrice');
    req.input('minPrice', sql.Numeric(19,6), opts.minPrice);
  }
  if (opts.maxPrice != null){
    where.push('L.Price <= @maxPrice');
    req.input('maxPrice', sql.Numeric(19,6), opts.maxPrice);
  }


  const whereSQL   = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sortBy     = VALID_SORT.includes(opts.sortBy) ? opts.sortBy : 'ItemCode';
  const sortOrder  = opts.sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

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
            P.ValidTo   AS DateTo,
            COUNT(*) OVER() AS totalRecords
    FROM dbo.ITM1_ListPrice  AS L
    JOIN dbo.OITM_Products   AS P ON P.ItemCode = L.ItemCode
    ${whereSQL}
  )
  SELECT ItemCode, PriceList, Price, PriceIVA,
         CreatedAt, UpdatedAt,
         ItemName, MinQuantity, DateFrom, DateTo,
         totalRecords
  FROM Q
  ORDER BY ${sortBy} ${sortOrder}
  OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
`;


  req.input('offset', sql.Int, (opts.page - 1) * opts.pageSize);
  req.input('pageSize', sql.Int, opts.pageSize);

  const r = await req.query(sqlText);
  console.log("consulta: ",sqlText)
  const totalRecords = r.recordset[0]?.totalRecords ?? 0;

  const data = r.recordset.map(({ totalRecords, ...row }) => row);

  return {
  page: opts.page,
  pageSize: opts.pageSize,
  totalRecords,
  totalPages: Math.ceil(totalRecords / opts.pageSize),
  data
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
            P.ValidTo   AS DateTo
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
