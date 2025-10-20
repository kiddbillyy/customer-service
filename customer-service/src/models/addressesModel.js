// src/models/addressesModel.js
import { getPool, sql } from '../config/db.js';

// ✅ Define la tabla una sola vez (y permite override por env si quieres)
const ADDR_TABLE = `[dbo].[${process.env.ADDRESSES_TABLE || 'CustomerAddresses'}]`;

export async function upsertAddress(customerId, a) {
  const pool = await getPool();
  const req = pool.request()
    .input('CustomerId', sql.NVarChar(50), customerId)
    .input('AddressCode', sql.NVarChar(50), a.addressCode)
    .input('AddressName', sql.NVarChar(100), a.addressName)
    .input('AddressType', sql.NVarChar(1), a.addressType ? String(a.addressType).toUpperCase() : null)
    .input('Street', sql.NVarChar(255), a.street)
    .input('StreetNo', sql.NVarChar(20), a.streetNo ?? null)
    .input('Building', sql.NVarChar(100), a.building ?? null)
    .input('Block', sql.NVarChar(100), a.block ?? null)
    .input('City', sql.NVarChar(100), a.city ?? null)
    .input('County', sql.NVarChar(100), a.county ?? null)
    .input('State', sql.NVarChar(100), a.state ?? null)
    .input('ZipCode', sql.NVarChar(20), a.zipCode ?? null)
    .input('Country', sql.NVarChar(3), a.country ?? 'CL')
    .input('Notes', sql.NVarChar(255), a.notes ?? null)
    .input('IsActive', sql.Bit, a.isActive == null ? 1 : (a.isActive ? 1 : 0));

  await req.query(`
    MERGE ${ADDR_TABLE} AS t
    USING (SELECT @CustomerId AS CustomerId, @AddressCode AS AddressCode) AS s
      ON t.CustomerId = s.CustomerId AND t.AddressCode = s.AddressCode
    WHEN MATCHED THEN
      UPDATE SET
        AddressName = @AddressName,
        AddressType = @AddressType,
        Street      = @Street,
        StreetNo    = @StreetNo,
        Building    = @Building,
        Block       = @Block,
        City        = @City,
        County      = @County,
        [State]     = @State,
        ZipCode     = @ZipCode,
        Country     = @Country,
        Notes       = @Notes,
        IsActive    = @IsActive,
        UpdatedAt   = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (CustomerId, AddressCode, AddressName, AddressType, Street, StreetNo, Building, Block,
              City, County, [State], ZipCode, Country, Notes, IsActive, CreatedAt, UpdatedAt)
      VALUES (@CustomerId, @AddressCode, @AddressName, @AddressType, @Street, @StreetNo, @Building, @Block,
              @City, @County, @State, @ZipCode, @Country, @Notes, @IsActive, SYSUTCDATETIME(), SYSUTCDATETIME());
  `);
}

export async function listAddresses(customerId) {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .input('Id', sql.NVarChar(50), customerId)
    .query(`SELECT * FROM ${ADDR_TABLE} WITH (NOLOCK) WHERE CustomerId=@Id ORDER BY AddressCode;`);
  return recordset;
}

export async function removeAddress(customerId, addressCode) {
  const pool = await getPool();
  const { rowsAffected } = await pool.request()
    .input('Id', sql.NVarChar(50), customerId)
    .input('Code', sql.NVarChar(50), addressCode)
    .query(`DELETE FROM ${ADDR_TABLE} WHERE CustomerId=@Id AND AddressCode=@Code;`);
  return rowsAffected[0] > 0;
}

export async function createMany(customerId, items, onConflict /* 'error'|'ignore'|'replace' */) {
  const pool = await getPool();

  // 1) validar cliente
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
        .input('CustomerId',  sql.NVarChar(50), customerId)
        .input('AddressCode', sql.NVarChar(50),  norm(a.addressCode, 50))
        .input('AddressName', sql.NVarChar(100), norm(a.addressName, 100))
        .input('AddressType', sql.NVarChar(1),  a.addressType ? String(a.addressType).toUpperCase() : null)
        .input('Street',      sql.NVarChar(255), norm(a.street, 255))
        .input('StreetNo',    sql.NVarChar(20),  norm(a.streetNo, 20))
        .input('Building',    sql.NVarChar(100), norm(a.building, 100))
        .input('Block',       sql.NVarChar(100), norm(a.block, 100))
        .input('City',        sql.NVarChar(100), norm(a.city, 100))
        .input('County',      sql.NVarChar(100), norm(a.county, 100))
        .input('State',       sql.NVarChar(100), norm(a.state, 100))
        .input('ZipCode',     sql.NVarChar(20),  norm(a.zipCode, 20))
        .input('Country',     sql.NVarChar(3),   norm(a.country, 3))
        .input('Notes',       sql.NVarChar(255), norm(a.notes, 255))
        .input('IsActive',    sql.Bit,           a.isActive ?? true);

      try {
        await reqIns.query(`
          INSERT INTO ${ADDR_TABLE}
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
              .input('CustomerId',  sql.NVarChar(50), customerId)
              .input('AddressCode', sql.NVarChar(50),  norm(a.addressCode, 50))
              .input('AddressName', sql.NVarChar(100), norm(a.addressName, 100))
              .input('AddressType', sql.NVarChar(1),  a.addressType ? String(a.addressType).toUpperCase() : null)
              .input('Street',      sql.NVarChar(255), norm(a.street, 255))
              .input('StreetNo',    sql.NVarChar(20),  norm(a.streetNo, 20))
              .input('Building',    sql.NVarChar(100), norm(a.building, 100))
              .input('Block',       sql.NVarChar(100), norm(a.block, 100))
              .input('City',        sql.NVarChar(100), norm(a.city, 100))
              .input('County',      sql.NVarChar(100), norm(a.county, 100))
              .input('State',       sql.NVarChar(100), norm(a.state, 100))
              .input('ZipCode',     sql.NVarChar(20),  norm(a.zipCode, 20))
              .input('Country',     sql.NVarChar(3),   norm(a.country, 3))
              .input('Notes',       sql.NVarChar(255), norm(a.notes, 255))
              .input('IsActive',    sql.Bit,           a.isActive ?? true)
              .query(`
                UPDATE ${ADDR_TABLE}
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
        console.error('[addresses.createMany][SQL_ERROR]', e?.originalError || e);
        throw e;
      }
    }

    await tx.commit();
    const payload = { created, updated, skipped };
    const status = (updated.length || skipped.length) ? 207 : 201;
    return { status, payload };
  } catch (err) {
    console.error('[addresses.createMany][EXCEPTION]', err?.stack || err);
    try { await tx.rollback(); } catch {}
    return { status: 500, payload: { error: 'INTERNAL_ERROR' } };
  }
}
