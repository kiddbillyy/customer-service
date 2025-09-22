import { getPool, sql } from '../config/db.js';

const BASE_SELECT = `
SELECT c.*
FROM dbo.Customers c WITH (NOLOCK)
WHERE c.DeletedAt IS NULL
`;

export async function listCustomers({ q, partnerType, groupCode, listNum, page = 1, pageSize = 20 }) {
  const pool = await getPool();
  const off = (page - 1) * pageSize;
  const req = pool.request()
    .input('off', sql.Int, off)
    .input('ps', sql.Int, pageSize);

  const wh = [];
  if (q) {
    req.input('q', sql.NVarChar, `%${q}%`);
    wh.push('(c.FirstName LIKE @q OR c.LastName LIKE @q OR c.Email LIKE @q OR c.RUT LIKE @q OR c.Id LIKE @q)');
  }
  if (partnerType) {
    req.input('pt', sql.Char(1), partnerType);
    wh.push('c.PartnerType = @pt');
  }
  if (groupCode != null) {
    req.input('gc', sql.Int, groupCode);
    wh.push('c.GroupCode = @gc');
  }
  if (listNum != null) {
    req.input('ln', sql.Int, listNum);
    wh.push('c.ListNum = @ln');
  }

  const whereSql = wh.length ? ' AND ' + wh.join(' AND ') : '';
  const dataSql = `${BASE_SELECT}${whereSql} ORDER BY c.Id DESC OFFSET @off ROWS FETCH NEXT @ps ROWS ONLY;`;
  const countSql = `SELECT COUNT(1) total FROM dbo.Customers c WHERE c.DeletedAt IS NULL${whereSql};`;

  const [rows, cnt] = await Promise.all([req.query(dataSql), req.query(countSql)]);
  return { items: rows.recordset, total: cnt.recordset[0].total };
}

export async function getCustomer(id) {
  const pool = await getPool();
  const { recordset } = await pool.request().input('id', sql.VarChar(64), id)
    .query(`${BASE_SELECT} AND c.Id = @id;`);
  return recordset[0] || null;
}

export async function createCustomer(payload) {
  const pool = await getPool();
  const now = new Date();
  const r = await pool.request()
    .input('Id', sql.VarChar(64), payload.id)
    .input('PartnerType', sql.Char(1), payload.partnerType)
    .input('RUT', sql.VarChar(20), payload.rut)
    .input('FirstName', sql.NVarChar(100), payload.firstName)
    .input('LastName', sql.NVarChar(100), payload.lastName)
    .input('Email', sql.NVarChar(255), payload.email)
    .input('Notes', sql.NVarChar(254), payload.notes ?? null)
    .input('Phone', sql.NVarChar(40), payload.phone ?? null)
    .input('Address', sql.NVarChar(255), payload.address ?? null)
    .input('City', sql.NVarChar(100), payload.city ?? null)
    .input('Region', sql.NVarChar(100), payload.region ?? null)
    .input('Country', sql.NVarChar(100), payload.country ?? 'CL')
    .input('GroupCode', sql.Int, payload.groupCode ?? null)
    .input('GroupNum', sql.Int, payload.groupNum ?? null)
    .input('ListNum', sql.Int, payload.listNum ?? null)
    .input('Currency', sql.NVarChar(3), payload.currency ?? null)
    .input('CreditLimit', sql.Decimal(19,2), payload.creditLimit ?? null)
    .input('DiscountPercent', sql.Decimal(5,2), payload.discountPercent ?? null)
    .input('DefaultBillToCode', sql.NVarChar(50), payload.defaultBillToCode ?? null)
    .input('DefaultShipToCode', sql.NVarChar(50), payload.defaultShipToCode ?? null)
    .input('DefaultContactCode', sql.Int, payload.defaultContactCode ?? null)
    .input('CreatedAt', sql.DateTime2(3), now)
    .input('UpdatedAt', sql.DateTime2(3), now)
    .query(`
      INSERT INTO dbo.Customers
  (Id, PartnerType, RUT, FirstName, LastName, Email, Notes, Phone, Address, City, Region, Country,
   GroupCode, GroupNum, ListNum, Currency, CreditLimit, DiscountPercent,
   DefaultBillToCode, DefaultShipToCode, DefaultContactCode, CreatedAt, UpdatedAt)
VALUES
  (@Id,@PartnerType,@RUT,@FirstName,@LastName,@Email,@Notes,@Phone,@Address,@City,@Region,@Country,
   @GroupCode,@GroupNum,@ListNum,@Currency,@CreditLimit,@DiscountPercent,
   @DefaultBillToCode,@DefaultShipToCode,@DefaultContactCode,@CreatedAt,@UpdatedAt);
    `);
  return await getCustomer(payload.id);
}

export async function updateCustomer(id, patch) {
  const pool = await getPool();
  const sets = [];
  const r = pool.request().input('id', sql.VarChar(64), id)
    .input('UpdatedAt', sql.DateTime2(3), new Date());
  const map = {
    partnerType: ['PartnerType', sql.Char(1)],
    rut: ['RUT', sql.VarChar(20)],
    firstName: ['FirstName', sql.NVarChar(100)],
    lastName: ['LastName', sql.NVarChar(100)],
    email: ['Email', sql.NVarChar(255)],
    notes: ['Notes', sql.NVarChar(255)],
    phone: ['Phone', sql.NVarChar(40)],
    address: ['Address', sql.NVarChar(255)],
    city: ['City', sql.NVarChar(100)],
    region: ['Region', sql.NVarChar(100)],
    country: ['Country', sql.NVarChar(100)],
    groupCode: ['GroupCode', sql.Int],
    groupNum: ['GroupNum', sql.Int],
    listNum: ['ListNum', sql.Int],
    currency: ['Currency', sql.NVarChar(3)],
    creditLimit: ['CreditLimit', sql.Decimal(19,2)],
    discountPercent: ['DiscountPercent', sql.Decimal(5,2)],
    defaultBillToCode: ['DefaultBillToCode', sql.NVarChar(50)],
    defaultShipToCode: ['DefaultShipToCode', sql.NVarChar(50)],
    defaultContactCode: ['DefaultContactCode', sql.Int],
    isActive: ['IsActive', sql.Bit]
  };
  for (const [key, [col, typ]] of Object.entries(map)) {
    if (key in patch) {
      sets.push(`${col}=@${col}`);
      r.input(col, typ, patch[key]);
    }
  }
  if (!sets.length) return await getCustomer(id);

  await r.query(`UPDATE dbo.Customers SET ${sets.join(', ')}, UpdatedAt=@UpdatedAt WHERE Id=@id AND DeletedAt IS NULL;`);
  return await getCustomer(id);
}

export async function createMany(customerId, items, onConflict /* 'error'|'ignore'|'replace' */) {
  const pool = await getPool();

  // 1) validar cliente (no borrado)
  const cust = await pool.request()
    .input('Id', sql.NVarChar(50), customerId)
    .query(`SELECT 1 FROM dbo.Customers WITH (NOLOCK) WHERE Id=@Id AND DeletedAt IS NULL;`);
  if (cust.recordset.length === 0) {
    return { status: 404, payload: { error: 'CUSTOMER_NOT_FOUND' } };
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();

  const created = [];
  const updated = [];
  const skipped = [];

  const norm = (v, max) => v == null ? null : String(v).trim().slice(0, max);

  try {
    for (const a of items) {
      const reqIns = new sql.Request(tx)
        .input('CustomerId', sql.NVarChar(50), customerId)
        .input('AddressCode', sql.NVarChar(50), norm(a.addressCode, 50))
        .input('AddressName', sql.NVarChar(100), norm(a.addressName, 100))
        .input('AddressType', sql.NVarChar(1), String(a.addressType).toUpperCase())
        .input('Street', sql.NVarChar(255), norm(a.street, 255))
        .input('StreetNo', sql.NVarChar(20), norm(a.streetNo, 20))
        .input('Building', sql.NVarChar(100), norm(a.building, 100))
        .input('Block', sql.NVarChar(100), norm(a.block, 100))
        .input('City', sql.NVarChar(100), norm(a.city, 100))
        .input('County', sql.NVarChar(100), norm(a.county, 100))
        .input('State', sql.NVarChar(100), norm(a.state, 100))
        .input('ZipCode', sql.NVarChar(20), norm(a.zipCode, 20))
        .input('Country', sql.NVarChar(3), norm(a.country, 3))
        .input('Notes', sql.NVarChar(255), norm(a.notes, 255))
        .input('IsActive', sql.Bit, a.isActive ?? true);

      try {
        await reqIns.query(`
          INSERT INTO dbo.CustomerAddresses
            (CustomerId, AddressCode, AddressName, AddressType, Street, StreetNo, Building, Block,
             City, County, [State], ZipCode, Country, Notes, IsActive, CreatedAt, UpdatedAt)
          VALUES
            (@CustomerId, @AddressCode, @AddressName, @AddressType, @Street, @StreetNo, @Building, @Block,
             @City, @County, @State, @ZipCode, @Country, @Notes, @IsActive, SYSUTCDATETIME(), SYSUTCDATETIME());
        `);
        created.push(a.addressCode);
      } catch (e) {
        const code = e?.number || e?.originalError?.info?.number;
        if (code === 2627 || code === 2601) {
          if (onConflict === 'ignore') { skipped.push(a.addressCode); continue; }
          if (onConflict === 'replace') {
            await new sql.Request(tx)
              .input('CustomerId', sql.NVarChar(50), customerId)
              .input('AddressCode', sql.NVarChar(50), norm(a.addressCode, 50))
              .input('AddressName', sql.NVarChar(100), norm(a.addressName, 100))
              .input('AddressType', sql.NVarChar(1), a.addressType ? String(a.addressType).toUpperCase() : null)
              .input('Street', sql.NVarChar(255), norm(a.street, 255))
              .input('StreetNo', sql.NVarChar(20), norm(a.streetNo, 20))
              .input('Building', sql.NVarChar(100), norm(a.building, 100))
              .input('Block', sql.NVarChar(100), norm(a.block, 100))
              .input('City', sql.NVarChar(100), norm(a.city, 100))
              .input('County', sql.NVarChar(100), norm(a.county, 100))
              .input('State', sql.NVarChar(100), norm(a.state, 100))
              .input('ZipCode', sql.NVarChar(20), norm(a.zipCode, 20))
              .input('Country', sql.NVarChar(3), norm(a.country, 3))
              .input('Notes', sql.NVarChar(255), norm(a.notes, 255))
              .input('IsActive', sql.Bit, a.isActive ?? true)
              .query(`
                UPDATE dbo.CustomerAddresses
                SET AddressName = COALESCE(@AddressName, AddressName),
                    AddressType = COALESCE(@AddressType, AddressType),
                    Street      = COALESCE(@Street, Street),
                    StreetNo    = COALESCE(@StreetNo, StreetNo),
                    Building    = COALESCE(@Building, Building),
                    Block       = COALESCE(@Block, Block),
                    City        = COALESCE(@City, City),
                    County      = COALESCE(@County, County),
                    [State]     = COALESCE(@State, [State]),
                    ZipCode     = COALESCE(@ZipCode, ZipCode),
                    Country     = COALESCE(@Country, Country),
                    Notes       = COALESCE(@Notes, Notes),
                    IsActive    = COALESCE(@IsActive, IsActive),
                    UpdatedAt   = SYSUTCDATETIME()
                WHERE CustomerId=@CustomerId AND AddressCode=@AddressCode;
              `);
            updated.push(a.addressCode);
            continue;
          }
          return await tx.rollback().then(() => ({
            status: 409,
            payload: { error: 'ADDRESS_EXISTS', details: `AddressCode ya existe: ${a.addressCode}` }
          }));
        }
        throw e;
      }
    }

    await tx.commit();
    const payload = { created, updated, skipped };
    const status = (updated.length || skipped.length) ? 207 : 201;
    return { status, payload };
  } catch (err) {
    try { await tx.rollback(); } catch {}
    return { status: 500, payload: { error: 'INTERNAL_ERROR' } };
  }
}
export async function softDeleteCustomer(id) {
  const pool = await getPool();
  const { rowsAffected } = await pool.request()
    .input('id', sql.VarChar(64), id)
    .input('now', sql.DateTime2(3), new Date())
    .query(`UPDATE dbo.Customers SET DeletedAt=@now, IsActive=0 WHERE Id=@id AND DeletedAt IS NULL;`);
  return rowsAffected[0] > 0;
}
export async function searchByName({ name, partnerType, page, pageSize, includeDeleted }) {
  const pool = await getPool();
  const reqCount = new sql.Request(pool);
  const reqPage  = new sql.Request(pool);

  // Si no quieres incluir eliminados: DeletedAt IS NULL
  let where = includeDeleted ? '1=1' : 'DeletedAt IS NULL';

  if (partnerType) {
    where += ' AND PartnerType = @PT';
    reqCount.input('PT', sql.NVarChar(1), partnerType);
    reqPage.input('PT', sql.NVarChar(1), partnerType);
  }

  if (name) {
    // Búsqueda case/acentos-insensible
    where += ` AND (
      FirstName COLLATE Latin1_General_CI_AI LIKE @Q OR
      LastName  COLLATE Latin1_General_CI_AI LIKE @Q OR
      (FirstName + ' ' + LastName) COLLATE Latin1_General_CI_AI LIKE @Q
    )`;
    reqCount.input('Q', sql.NVarChar(210), `%${name}%`);
    reqPage.input('Q', sql.NVarChar(210), `%${name}%`);
  }

  const total = (await reqCount.query(`
    SELECT COUNT(*) AS total
    FROM dbo.Customers WITH (NOLOCK)
    WHERE ${where};
  `)).recordset[0]?.total ?? 0;

  const offset = (page - 1) * pageSize;
  const items = (await reqPage.query(`
    SELECT
      Id, PartnerType, RUT, FirstName, LastName, Email, Phone,
      GroupCode, GroupNum, ListNum, Currency, IsActive, CreatedAt, UpdatedAt, DeletedAt
    FROM dbo.Customers WITH (NOLOCK)
    WHERE ${where}
    ORDER BY LastName, FirstName
    OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
  `)).recordset;

  return { items, page, pageSize, total };
}