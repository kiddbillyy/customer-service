// models/Locations.Model.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

// helpers
function isNonEmptyString(s) {
  return typeof s === 'string' && s.trim().length > 0;
}
function normOrNull(s) {
  return isNonEmptyString(s) ? s.trim() : null;
}
function toBit(status) {
  // admite true/false | 'active'/'inactive' | 1/0
  if (status === true || status === 1 || String(status).toLowerCase() === 'active') return 1;
  if (status === false || status === 0 || String(status).toLowerCase() === 'inactive') return 0;
  return 1; 
}
function normUser(u) {
  if (u == null) return 'API';
  return (String(u).toUpperCase().trim().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'API');
}

async function createLocation({
  storeId,
  name,
  country = null,
  stateProvince = null,
  city = null,
  addressLine1 = null,
  addressLine2 = null,
  postalCode = null,
  status = 'active',
  user
}) {
  if (!Number.isInteger(storeId)) throw new Error('STORE_ID_REQUIRED');
  if (!isNonEmptyString(name)) throw new Error('NAME_REQUIRED');

  await IdServicePoolConnect;

  const store = (await IdServicePool.request()
    .input('sid', sql.Int, storeId)
    .query('SELECT 1 AS ok FROM dbo.Store WHERE Id = @sid')).recordset[0];
  if (!store) throw new Error('STORE_NOT_FOUND');

  const r = await IdServicePool.request()
    .input('StoreId', sql.Int, storeId)
    .input('Name', sql.NVarChar(200), name.trim())
    .input('Country', sql.NVarChar(100), normOrNull(country))
    .input('StateProvince', sql.NVarChar(100), normOrNull(stateProvince))
    .input('City', sql.NVarChar(100), normOrNull(city))
    .input('AddressLine1', sql.NVarChar(200), normOrNull(addressLine1))
    .input('AddressLine2', sql.NVarChar(200), normOrNull(addressLine2))
    .input('PostalCode', sql.NVarChar(20), normOrNull(postalCode))
    .input('Status', sql.Bit, toBit(status))
    .input('UserCreated', sql.NVarChar(5), normUser(user))
    .query(`
      INSERT INTO dbo.Location
        (StoreId, Name, Country, StateProvince, City, AddressLine1, AddressLine2, PostalCode,
         Status, CreatedAt, UpdatedAt, UserCreated, UserModified)
      OUTPUT INSERTED.Id
      VALUES
        (@StoreId, @Name, @Country, @StateProvince, @City, @AddressLine1, @AddressLine2, @PostalCode,
         @Status, SYSUTCDATETIME(), NULL, @UserCreated, NULL);
    `);

  const id = r.recordset?.[0]?.Id;
  return { id };
}

// UPDATE
async function updateLocation({
  id,
  storeId,
  name,
  country = null,
  stateProvince = null,
  city = null,
  addressLine1 = null,
  addressLine2 = null,
  postalCode = null,
  status = 'active',
  user
}) {
  if (!Number.isInteger(id)) throw new Error('LOCATION_NOT_FOUND');
  if (!Number.isInteger(storeId)) throw new Error('STORE_ID_REQUIRED');
  if (!isNonEmptyString(name)) throw new Error('NAME_REQUIRED');

  await IdServicePoolConnect;

  const exists = (await IdServicePool.request()
    .input('id', sql.Int, id)
    .query('SELECT 1 AS ok FROM dbo.Location WHERE Id = @id')).recordset[0];
  if (!exists) throw new Error('LOCATION_NOT_FOUND');

  const store = (await IdServicePool.request()
    .input('sid', sql.Int, storeId)
    .query('SELECT 1 AS ok FROM dbo.Store WHERE Id = @sid')).recordset[0];
  if (!store) throw new Error('STORE_NOT_FOUND');

  const r = await IdServicePool.request()
    .input('Id', sql.Int, id)
    .input('StoreId', sql.Int, storeId)
    .input('Name', sql.NVarChar(200), name.trim())
    .input('Country', sql.NVarChar(100), normOrNull(country))
    .input('StateProvince', sql.NVarChar(100), normOrNull(stateProvince))
    .input('City', sql.NVarChar(100), normOrNull(city))
    .input('AddressLine1', sql.NVarChar(200), normOrNull(addressLine1))
    .input('AddressLine2', sql.NVarChar(200), normOrNull(addressLine2))
    .input('PostalCode', sql.NVarChar(20), normOrNull(postalCode))
    .input('Status', sql.Bit, toBit(status))
    .input('UserModified', sql.NVarChar(5), normUser(user))
    .query(`
      UPDATE dbo.Location
      SET StoreId      = @StoreId,
          Name         = @Name,
          Country      = @Country,
          StateProvince= @StateProvince,
          City         = @City,
          AddressLine1 = @AddressLine1,
          AddressLine2 = @AddressLine2,
          PostalCode   = @PostalCode,
          Status       = @Status,
          UpdatedAt    = SYSUTCDATETIME(),
          UserModified = @UserModified
      WHERE Id = @Id;

      SELECT @Id AS Id;
    `);

  const outId = r.recordset?.[0]?.Id;
  return { id: outId };
}

// GET BY ID
async function getLocationById({ id }) {
  await IdServicePoolConnect;

  const { recordset } = await IdServicePool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT
        l.Id, l.StoreId, l.Name, l.Country, l.StateProvince, l.City,
        l.AddressLine1, l.AddressLine2, l.PostalCode,
        l.Status, l.CreatedAt, l.UpdatedAt, l.UserCreated, l.UserModified
      FROM dbo.Location l
      WHERE l.Id = @id;
    `);

  const row = recordset[0];
  if (!row) return null;

  return {
    id: String(row.Id),
    storeId: row.StoreId,
    name: row.Name,
    country: row.Country,
    stateProvince: row.StateProvince,
    city: row.City,
    addressLine1: row.AddressLine1,
    addressLine2: row.AddressLine2,
    postalCode: row.PostalCode,
    status: row.Status ? 'active' : 'inactive',
    dateCreated: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : null,
    dateModified: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
    userCreated: row.UserCreated || null,
    userModified: row.UserModified || null
  };
}

// LIST (con filtros opcionales y paginación opcional)
async function listLocations({
  storeId = null,
  status = null,          // 'active'|'inactive'|true|false|null
  search = null,          // busca en Name/City/AddressLine1
  page = 1,
  pageSize = 50
} = {}) {
  await IdServicePoolConnect;

  const where = [];
  if (Number.isInteger(storeId)) where.push('l.StoreId = @StoreId');
  if (status !== null) where.push(`l.Status = @Status`);
  if (isNonEmptyString(search)) where.push(`(l.Name LIKE @Q OR l.City LIKE @Q OR l.AddressLine1 LIKE @Q)`);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const take = Math.max(1, Math.min(1000, Number(pageSize) || 50));
  const skip = Math.max(0, (Number(page) || 1) - 1) * take;

  const req = IdServicePool.request();
  if (Number.isInteger(storeId)) req.input('StoreId', sql.Int, storeId);
  if (status !== null) req.input('Status', sql.Bit, toBit(status));
  if (isNonEmptyString(search)) req.input('Q', sql.NVarChar(210), `%${search.trim()}%`);
  req.input('Skip', sql.Int, skip);
  req.input('Take', sql.Int, take);

  const { recordset } = await req.query(`
    WITH page AS (
      SELECT l.Id
      FROM dbo.Location l
      ${whereSql}
      ORDER BY l.CreatedAt DESC, l.Id DESC
      OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY
    )
    SELECT
      l.Id, l.StoreId, l.Name, l.Country, l.StateProvince, l.City,
      l.AddressLine1, l.AddressLine2, l.PostalCode,
      l.Status, l.CreatedAt, l.UpdatedAt, l.UserCreated, l.UserModified
    FROM page p
    JOIN dbo.Location l ON l.Id = p.Id
    ORDER BY l.CreatedAt DESC, l.Id DESC;
  `);

  return recordset.map(row => ({
    id: String(row.Id),
    storeId: row.StoreId,
    name: row.Name,
    country: row.Country,
    stateProvince: row.StateProvince,
    city: row.City,
    addressLine1: row.AddressLine1,
    addressLine2: row.AddressLine2,
    postalCode: row.PostalCode,
    status: row.Status ? 'active' : 'inactive',
    dateCreated: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : null,
    dateModified: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
    userCreated: row.UserCreated || null,
    userModified: row.UserModified || null
  }));
}

module.exports = {
  createLocation,
  updateLocation,
  getLocationById,
  listLocations
};
