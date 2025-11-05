// src/models/customersModel.js
import { getPool, sql } from '../config/db.js';
import { upsertBusinessPartner } from '../integrations/sapB1.js'; // 🔄 sync SAP tras PATCH

const BASE_SELECT = `
SELECT c.*,g.groupname
FROM dbo.Customers c WITH (NOLOCK)
left join CustomerGroups g on c.groupcode=g.groupcode
WHERE c.DeletedAt IS NULL
`;

/** Helper: agrega un parámetro solo si está definido (evita pasar NULL “gratis”). */
function add(req, name, type, value) {
  if (value !== undefined) req.input(name, type, value);
}

async function getCustomerByRut(rut) {
  if (!rut) return null;
  const pool = await getPool();
  const { recordset } = await pool.request()
    .input('rut', sql.VarChar(20), rut)
    .query(`${BASE_SELECT} AND c.RUT = @rut;`);
  return recordset[0] || null;
}

function applyRequestInputsFromPayload(req, payload) {
  // Reutiliza exactamente los mismos tipos/nombres que ya usas en INSERT
  return req
    .input('PartnerType',         sql.Char(1),        payload.partnerType)
    .input('RUT',                 sql.VarChar(20),    payload.rut)
    .input('FirstName',           sql.NVarChar(100),  payload.firstName)
    .input('LastName',            sql.NVarChar(100),  payload.lastName)
    .input('Email',               sql.NVarChar(255),  payload.email)
    .input('Notes',               sql.NVarChar(254),  payload.notes ?? null)
    .input('Phone',               sql.NVarChar(40),   payload.phone ?? null)
    .input('Address',             sql.NVarChar(255),  payload.address ?? null)
    .input('City',                sql.NVarChar(100),  payload.city ?? null)
    .input('Region',              sql.NVarChar(100),  payload.region ?? null)
    .input('Country',             sql.NVarChar(100),  payload.country ?? 'CL')
    .input('GroupCode',           sql.Int,            payload.groupCode ?? null)
    .input('GroupNum',            sql.Int,            payload.groupNum ?? null)
    .input('ListNum',             sql.Int,            payload.listNum ?? null)
    .input('Currency',            sql.NVarChar(3),    payload.currency ?? 'CLP')
    .input('CreditLimit',         sql.Decimal(18,2),  payload.creditLimit ?? null)
    .input('DiscountPercent',     sql.Decimal(9,2),   payload.discountPercent ?? null)
    .input('DefaultBillToCode',   sql.NVarChar(50),   payload.defaultBillToCode ?? null)
    .input('DefaultShipToCode',   sql.NVarChar(50),   payload.defaultShipToCode ?? null)
    .input('DefaultContactCode',  sql.Int,            payload.defaultContactCode ?? null);
}

/** Caller del SP: dbo.UpsertCustomerAndEnqueueCredit */
export async function upsertCustomerAndEnqueueCredit_SP({
  customerId = null,           // opcional, tu SP lo ignora para la PK
  cardCode,                    // NVARCHAR(50)  -> Customers.Id
  name,                        // NVARCHAR(200) -> FirstName (nombre corto)
  rut,                         // NVARCHAR(20)  -> NUNCA null
  partnerType = 'C',           // NVARCHAR(5)
  creditLimit = null,          // DECIMAL(18,2) -> si null, no encola
  paymentTermCode = null,      // NVARCHAR(50)
  riskLevel = 0,               // INT
  isBlocked = 0,               // BIT
  notes = null,                // NVARCHAR(500)
  traceId = null               // NVARCHAR(100)
}) {
  const pool = await getPool();
  const req = pool.request()
    .input('customerId', sql.UniqueIdentifier, customerId)
    .input('cardCode', sql.NVarChar(50), cardCode)
    .input('name', sql.NVarChar(200), name)
    .input('rut', sql.NVarChar(20), rut)                 // 👈 importante: no null
    .input('partnerType', sql.NVarChar(5), partnerType)
    .input('creditLimit', sql.Decimal(18, 2), creditLimit)
    .input('paymentTermCode', sql.NVarChar(50), paymentTermCode)
    .input('riskLevel', sql.Int, riskLevel)
    .input('isBlocked', sql.Bit, isBlocked ?? 0)
    .input('notes', sql.NVarChar(500), notes)
    .input('traceId', sql.NVarChar(100), traceId);

  const { recordset } = await req.execute('dbo.UpsertCustomerAndEnqueueCredit');
  return recordset?.[0] ?? null;  // opcional: { cardCode, traceId }
}

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

/** Crear cliente “simple”: inserta directo y retorna */
export async function createCustomer(payload) {
  const pool = await getPool();
  const now = new Date();

  try {
    // 1) INSERT normal
    const reqIns = pool.request()
      .input('Id', sql.VarChar(64), payload.id)
      .input('CreatedAt', sql.DateTime2(3), now)
      .input('UpdatedAt', sql.DateTime2(3), now);

    applyRequestInputsFromPayload(reqIns, payload);

    await reqIns.query(`
      INSERT INTO dbo.Customers
      (Id, PartnerType, RUT, FirstName, LastName, Email, Notes, Phone, Address, City, Region, Country,
       GroupCode, GroupNum, ListNum, Currency, CreditLimit, DiscountPercent,
       DefaultBillToCode, DefaultShipToCode, DefaultContactCode, CreatedAt, UpdatedAt, IsActive)
      VALUES
      (@Id,@PartnerType,@RUT,@FirstName,@LastName,@Email,@Notes,@Phone,@Address,@City,@Region,@Country,
       @GroupCode,@GroupNum,@ListNum,@Currency,@CreditLimit,@DiscountPercent,
       @DefaultBillToCode,@DefaultShipToCode,@DefaultContactCode,@CreatedAt,@UpdatedAt, 1);
    `);

    return await getCustomer(payload.id);

  } catch (e) {
    const number = e?.number || e?.originalError?.info?.number;
    const isDup = number === 2627 || number === 2601;
    if (!isDup) throw e;

    // 2) Duplicado → resolver idempotente
    const existingById = await getCustomer(payload.id);
    if (existingById) {
      const r = pool.request()
        .input('Id', sql.VarChar(64), payload.id)
        .input('UpdatedAt', sql.DateTime2(3), new Date());
      applyRequestInputsFromPayload(r, payload);

      await r.query(`
        UPDATE dbo.Customers
        SET
          PartnerType       = COALESCE(@PartnerType, PartnerType),
          RUT               = COALESCE(@RUT, RUT),
          FirstName         = COALESCE(@FirstName, FirstName),
          LastName          = COALESCE(@LastName, LastName),
          Email             = COALESCE(@Email, Email),
          Notes             = COALESCE(@Notes, Notes),
          Phone             = COALESCE(@Phone, Phone),
          Address           = COALESCE(@Address, Address),
          City              = COALESCE(@City, City),
          Region            = COALESCE(@Region, Region),
          Country           = COALESCE(@Country, Country),
          GroupCode         = COALESCE(@GroupCode, GroupCode),
          GroupNum          = COALESCE(@GroupNum, GroupNum),
          ListNum           = COALESCE(@ListNum, ListNum),
          Currency          = COALESCE(@Currency, Currency),
          CreditLimit       = COALESCE(@CreditLimit, CreditLimit),
          DiscountPercent   = COALESCE(@DiscountPercent, DiscountPercent),
          DefaultBillToCode = COALESCE(@DefaultBillToCode, DefaultBillToCode),
          DefaultShipToCode = COALESCE(@DefaultShipToCode, DefaultShipToCode),
          DefaultContactCode= COALESCE(@DefaultContactCode, DefaultContactCode),
          IsActive          = 1,
          UpdatedAt         = @UpdatedAt
        WHERE Id=@Id AND DeletedAt IS NULL;
      `);

      return await getCustomer(payload.id);
    }

    // Duplicado por RUT
    const existingByRut = await getCustomerByRut(payload.rut);
    if (existingByRut) {
      const r = pool.request()
        .input('Id', sql.VarChar(64), existingByRut.Id)
        .input('UpdatedAt', sql.DateTime2(3), new Date());
      applyRequestInputsFromPayload(r, payload);

      await r.query(`
        UPDATE dbo.Customers
        SET
          PartnerType       = COALESCE(@PartnerType, PartnerType),
          RUT               = COALESCE(@RUT, RUT),
          FirstName         = COALESCE(@FirstName, FirstName),
          LastName          = COALESCE(@LastName, LastName),
          Email             = COALESCE(@Email, Email),
          Notes             = COALESCE(@Notes, Notes),
          Phone             = COALESCE(@Phone, Phone),
          Address           = COALESCE(@Address, Address),
          City              = COALESCE(@City, City),
          Region            = COALESCE(@Region, Region),
          Country           = COALESCE(@Country, Country),
          GroupCode         = COALESCE(@GroupCode, GroupCode),
          GroupNum          = COALESCE(@GroupNum, GroupNum),
          ListNum           = COALESCE(@ListNum, ListNum),
          Currency          = COALESCE(@Currency, Currency),
          CreditLimit       = COALESCE(@CreditLimit, CreditLimit),
          DiscountPercent   = COALESCE(@DiscountPercent, DiscountPercent),
          DefaultBillToCode = COALESCE(@DefaultBillToCode, DefaultBillToCode),
          DefaultShipToCode = COALESCE(@DefaultShipToCode, DefaultShipToCode),
          DefaultContactCode= COALESCE(@DefaultContactCode, DefaultContactCode),
          IsActive          = 1,
          UpdatedAt         = @UpdatedAt
        WHERE Id=@Id AND DeletedAt IS NULL;
      `);

      return await getCustomer(existingByRut.Id);
    }

    // No pudimos resolver el duplicado
    throw e;
  }
}

/** UPDATE parcial:
 *  - Si viene creditLimit ⇒ usa SP (y rellena rut/partnerType desde DB si faltan)
 *  - Resto de campos ⇒ UPDATE dinámico por columnas
 *  - Al final, sincroniza con SAP (upsert: PATCH si existe, POST si no)
 */
export async function updateCustomer(id, patch) {
  // 1) Si toca crédito, pasamos por el SP (evento + consistencia)
  if (Object.prototype.hasOwnProperty.call(patch, 'creditLimit')) {
    const current = await getCustomer(id);
    if (!current) throw new Error('CUSTOMER_NOT_FOUND');

    // isBlocked opcional: puedes inferirlo de isActive si lo mandan
    const isBlocked = (patch.isActive === false) ? 1 : undefined;

    await upsertCustomerAndEnqueueCredit_SP({
      cardCode: id,
      name: patch.firstName ?? current.FirstName ?? id, // nombre visible en SP
      rut: patch.rut ?? current.RUT,                   // 👈 NUNCA NULL
      partnerType: patch.partnerType ?? current.PartnerType ?? 'C',
      creditLimit: patch.creditLimit,
      paymentTermCode: patch.paymentTermCode,          // opcional
      riskLevel: patch.riskLevel,                      // opcional
      isBlocked,                                       // opcional
      notes: patch.notes ?? current.Notes              // opcional
    });

    // retira campos manejados por SP
    const { creditLimit, paymentTermCode, riskLevel, isActive, notes, ...rest } = patch;
    patch = rest;
  }

  // 2) Resto de columnas por UPDATE dinámico (solo lo que viene en patch)
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
    discountPercent: ['DiscountPercent', sql.Decimal(9,2)],
    defaultBillToCode: ['DefaultBillToCode', sql.NVarChar(50)],
    defaultShipToCode: ['DefaultShipToCode', sql.NVarChar(50)],
    defaultContactCode: ['DefaultContactCode', sql.Int],
    isActive: ['IsActive', sql.Bit]
  };

  for (const [key, [col, typ]] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`${col}=@${col}`);
      r.input(col, typ, patch[key]);
    }
  }

  let updated;
  if (sets.length) {
    await r.query(`UPDATE dbo.Customers SET ${sets.join(', ')}, UpdatedAt=@UpdatedAt WHERE Id=@id AND DeletedAt IS NULL;`);
    updated = await getCustomer(id);
  } else {
    // Nada para actualizar (pudo haber sido solo creditLimit)
    updated = await getCustomer(id);
  }

  // 3) 🔄 Sincroniza con SAP (no bloquea la respuesta si falla)
  try {
    if (updated) {
      await upsertBusinessPartner(updated /* customer */, [] /* direcciones si las lees aquí */);
    }
  } catch (e) {
    console.warn('[SAP BP][patch][warn] no se pudo sincronizar:', e?.message || e);
  }

  return updated;
}

export async function createMany(customerId, items, onConflict /* 'error'|'ignore'|'replace' */) {
  const pool = await getPool();

  // valida cliente (no borrado)
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
          await tx.rollback();
          return { status: 409, payload: { error: 'ADDRESS_EXISTS', details: `AddressCode ya existe: ${a.addressCode}` } };
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

  let where = includeDeleted ? '1=1' : 'DeletedAt IS NULL';

  if (partnerType) {
    where += ' AND PartnerType = @PT';
    reqCount.input('PT', sql.NVarChar(1), partnerType);
    reqPage.input('PT', sql.NVarChar(1), partnerType);
  }

  if (name) {
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
