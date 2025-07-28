const { catalogPool, catalogPoolConnect, sql } = require('../config/dbnew');
const { sapPool, sapPoolConnect } = require('../config/dbnewsap'); 


const VALID_SORT = [
  'ListNum', 'ListName', 'GroupCode',
  'UpdateDate', 'CreateDate', 'ValidFrom', 'ValidTo'
];

function dateParam(req, name, value) {
  if (!value) return;
  req.input(name, sql.DateTime, value);
}


const usersCache = new Map();
let   cacheUntil = 0;

async function getUsersByIds(ids = []) {
  if (!ids.length) return [];

  await sapPoolConnect;
  const now = Date.now();

  // ¿Todo en caché y vigente?
  if (now < cacheUntil && ids.every(id => usersCache.has(id))) {
    return ids.map(id => usersCache.get(id));
  }

  const missing = ids.filter(id => !usersCache.has(id));
  if (missing.length) {
    const req = sapPool.request();
    missing.forEach((id, i) => req.input(`id${i}`, sql.Int, id));
    const inList = missing.map((_, i) => `@id${i}`).join(',');

    const rows = (await req.query(`
      SELECT USERID, U_NAME AS name, E_Mail AS email
      FROM   OUSR
      WHERE  USERID IN (${inList})
    `)).recordset;

    rows.forEach(r => usersCache.set(r.USERID, { name: r.name, email: r.email }));
  }

  cacheUntil = now + 5 * 60 * 1000; // 5 min
  return ids.map(id => usersCache.get(id) ?? { name: null, email: null });
}


async function getPriceLists(opts) {
  await catalogPoolConnect;
  const where = [];
  const req = catalogPool.request();

  if (opts.listNum != null) {
    where.push('P.ListNum = @listNum');
    req.input('listNum', sql.Int, opts.listNum);
  }
  if (opts.listName) {
    where.push('P.ListName LIKE @listName');
    req.input('listName', sql.NVarChar(64), `%${opts.listName}%`);
  }
  if (opts.groupCode != null) {
    where.push('P.GroupCode = @groupCode');
    req.input('groupCode', sql.SmallInt, opts.groupCode);
  }
  if (opts.validFor) {
    where.push('P.ValidFor = @validFor');
    req.input('validFor', sql.Char(1), opts.validFor.toUpperCase());
  }
  if (opts.validFrom) {
    where.push('P.ValidFrom >= @validFrom');
    dateParam(req, 'validFrom', opts.validFrom);
  }
  if (opts.validTo) {
    where.push('P.ValidTo <= @validTo');
    dateParam(req, 'validTo', opts.validTo);
  }

  const whereSQL  = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sortBy    = VALID_SORT.includes(opts.sortBy) ? opts.sortBy : 'ListNum';
  const sortOrder = opts.sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const sqlText = `
    WITH Q AS (
      SELECT P.ListNum, P.ListName, P.GroupCode,
             P.UserSign,  P.UserSign2,
             P.UpdateDate, P.CreateDate,
             P.ValidFor,  P.ValidFrom, P.ValidTo,
             COUNT(*) OVER() AS totalRecords
      FROM dbo.OPLN_PRICE_LIST AS P
      ${whereSQL}
    )
    SELECT ListNum, ListName, GroupCode,
           UserSign, UserSign2,
           UpdateDate, CreateDate,
           ValidFor, ValidFrom, ValidTo,
           totalRecords
    FROM Q
    ORDER BY ${sortBy} ${sortOrder}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  req.input('offset',   sql.Int, (opts.page - 1) * opts.pageSize);
  req.input('pageSize', sql.Int, opts.pageSize);

  const { recordset } = await req.query(sqlText);
  const totalRecords = recordset[0]?.totalRecords ?? 0;
  //const data         = recordset.map(({ totalRecords, ...row }) => row);

   const userIds = [
    ...new Set(
      recordset.flatMap(r => [r.UserSign, r.UserSign2]).filter(Boolean)
    )
  ];
  const userInfo = await getUsersByIds(userIds);
  const userMap  = Object.fromEntries(userIds.map((id, i) => [id, userInfo[i]]));

  const data = recordset.map(({ totalRecords, UserSign, UserSign2, ...row }) => ({
    ...row,
    CreatedByName   : userMap[UserSign]?.name  ?? null,
    CreatedByEmail  : userMap[UserSign]?.email ?? null,
    UpdatedByName   : userMap[UserSign2]?.name  ?? null,
    UpdatedByEmail  : userMap[UserSign2]?.email ?? null,
    // ↓ si prefieres ocultar los IDs, simplemente no los incluyas
    CreatedById     : UserSign,
    UpdatedById     : UserSign2
  }));


  return {
    page: opts.page,
    pageSize: opts.pageSize,
    totalRecords,
    totalPages: Math.ceil(totalRecords / opts.pageSize),
    data
  };
}

async function getPriceListById(listNum) {
  await catalogPoolConnect;
  const { recordset } = await catalogPool.request()
    .input('listNum', sql.Int, listNum)
    .query(`
      SELECT ListNum, ListName, GroupCode,
             UserSign,  UserSign2,
             UpdateDate, CreateDate,
             ValidFor,  ValidFrom, ValidTo
      FROM dbo.OPLN_PRICE_LIST
      WHERE ListNum = @listNum;
    `);

  const row = recordset[0];
  if (!row) return null;
  const [created, updated] = await getUsersByIds(
    [row.UserSign, row.UserSign2].filter(Boolean)
  );

  return {
    ...row,
    CreatedByName  : created?.name,
    CreatedByEmail : created?.email,
    UpdatedByName  : updated?.name,
    UpdatedByEmail : updated?.email
  };
}



module.exports = { getPriceLists, getPriceListById };
