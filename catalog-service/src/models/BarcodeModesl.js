const { catalogPool, catalogPoolConnect, sql } = require('../config/dbnew');

// Campos válidos para ordenar
const VALID_SORT = ['ItemCode', 'UpdateDate'];

/**
 * Lista barcodes por SKU.
 * - Si opts.itemCode viene (LIKE), NO aplica paginación (se ignoran page y pageSize).
 * - Si no, aplica paginación estándar.
 *
 * Retorna:
 * {
 *   page, pageSize, totalRecords, totalPages,
 *   data: [{ ItemCode, Primary, Secondary:[], All:[], UpdateDate }]
 * }
 */
async function listBarcodes(opts) {
  await catalogPoolConnect;

  const where = [`P.ValidFor = 'Y'`];
  const req = catalogPool.request();

  if (opts.itemCode) {
    // filtro LIKE; ejemplo "001002%" o "001002001"
    where.push('P.ItemCode LIKE @itemCode');
    req.input('itemCode', sql.NVarChar(50), `%${opts.itemCode}%`);
  }

  const sortBy = VALID_SORT.includes(opts.sortBy) ? opts.sortBy : 'ItemCode';
  const sortOrder = (opts.sortOrder || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const whereSQL = where.length ? ('WHERE ' + where.join(' AND ')) : '';

  // Si hay itemCode, NO paginar (ignorar page/pageSize)
  let pagingSQL = `ORDER BY ${sortBy} ${sortOrder}`;
  if (!opts.itemCode) {
    req.input('offset', sql.Int, (opts.page - 1) * opts.pageSize);
    req.input('pageSize', sql.Int, opts.pageSize);
    pagingSQL += ` OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`;
  }

  // 1) Traemos SKUs con su barcode principal y totalRecords (window)
  const sqlItems = `
    WITH Q AS (
      SELECT
        P.ItemCode,
        P.CodeBars    AS PrimaryBarcode,
        P.UpdateDate  AS UpdateDate,
        COUNT(*) OVER() AS totalRecords
      FROM dbo.OITM_Products AS P
      ${whereSQL}
    )
    SELECT ItemCode, PrimaryBarcode, UpdateDate, totalRecords
    FROM Q
    ${pagingSQL};
  `;

  const rs1 = await req.query(sqlItems);
  const rows = rs1.recordset || [];

  if (!rows.length) {
    return {
      page: opts.itemCode ? 1 : opts.page,
      pageSize: opts.itemCode ? 0 : opts.pageSize,
      totalRecords: 0,
      totalPages: 0,
      data: []
    };
  }

  // itemCodes que hay que enriquecer con secundarios
  const itemCodes = rows.map(r => r.ItemCode);

  // 2) Consultamos todos los códigos de OBCD_QR para esos SKUs
  const req2 = catalogPool.request();
  itemCodes.forEach((code, i) => req2.input('c' + i, sql.NVarChar(50), code));
  const inList = itemCodes.map((_, i) => '@c' + i).join(',');

  const sqlBarcodes = `
    SELECT ItemCode, BcdCode
    FROM dbo.OBCD_QR
    WHERE ItemCode IN (${inList});
  `;
  const rs2 = await req2.query(sqlBarcodes);
  const bcRows = rs2.recordset || [];

  // 3) Armamos map por ItemCode
  const map = new Map();
  for (const r of rows) {
    map.set(r.ItemCode, {
      ItemCode: r.ItemCode,
      Primary: r.PrimaryBarcode ?? null,
      Secondary: [],
      All: [],
      UpdateDate: r.UpdateDate
    });
  }

  // 4) Agregamos todos los códigos y derivamos secundarios (≠ principal)
  for (const b of bcRows) {
    const entry = map.get(b.ItemCode);
    if (!entry) continue;
    if (b.BcdCode && String(b.BcdCode).trim().length) {
      entry.All.push(String(b.BcdCode).trim());
    }
  }

  for (const entry of map.values()) {
    // Deduplicar y asegurar que el principal esté presente en All
    const set = new Set(entry.All.map(x => String(x)));
    if (entry.Primary) set.add(String(entry.Primary));
    entry.All = Array.from(set);
    entry.Secondary = entry.All.filter(code => entry.Primary ? String(code) !== String(entry.Primary) : true);
  }

  const data = Array.from(map.values());

  // Totales
  let totalRecords = rows[0]?.totalRecords ?? rows.length;
  if (opts.itemCode) {
    // ignoramos paginación: totalRecords = todo lo que calzó con el LIKE
    totalRecords = rows.length;
  }

  return {
    page: opts.itemCode ? 1 : opts.page,
    pageSize: opts.itemCode ? data.length : opts.pageSize,
    totalRecords,
    totalPages: opts.itemCode ? 1 : Math.ceil(totalRecords / opts.pageSize),
    data
  };
}

/** Para obtener por itemCode exacto (SKU) */
async function getBarcodesByItemCode(itemCode) {
  return await listBarcodes({
    itemCode, 
    page: 1,
    pageSize: 999999,
    sortBy: 'ItemCode',
    sortOrder: 'ASC'
  });
}

module.exports = { listBarcodes, getBarcodesByItemCode
};
