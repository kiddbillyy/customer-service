// models/Holidays.Model.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');

const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const normUser5 = (u) => (u == null ? 'API' : String(u).slice(0, 5));
const normStatus = (s) => (String(s || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active');

function buildTargetJson(target) {
  const delivery = !!(target && typeof target === 'object' && target.delivery === true);
  return JSON.stringify({ delivery });
}
function buildScopeJson(scope) {
  if (!scope) return null;
  if (typeof scope !== 'object') return null;
  const carrierIds = Array.isArray(scope.carrierIds) ? scope.carrierIds : [];
  const carrierReferenceIds = Array.isArray(scope.carrierReferenceIds) ? scope.carrierReferenceIds : [];
  if (carrierIds.length === 0 && carrierReferenceIds.length === 0) return null; // interpreta “aplica a todos”
  return JSON.stringify({ carrierIds, carrierReferenceIds });
}
function rowToApi(row) {
  let target = null, scope = null;
  try { target = row.Target ? JSON.parse(row.Target) : null; } catch { target = null; }
  try { scope  = row.Scope  ? JSON.parse(row.Scope)  : null; } catch { scope  = null; }
  return {
    id: String(row.Id),
    name: row.Name,
    day: row.Day ? row.Day.toISOString().slice(0, 10) : null,
    status: row.Status,
    target,
    scope,
    description: row.Description || null,
    dateCreated: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : null,
    dateModified: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
    userCreated: row.UserCreated || null,
    userModified: row.UserModified || null,
  };
}

// CREATE
async function createHoliday({ name, day, status = 'active', target = {}, scope = null, description = null, user = 'API' }) {
  if (!name) throw new Error('NAME_REQUIRED');
  if (!isIsoDate(day)) throw new Error('DAY_INVALID');

  await IdServicePoolConnect;

  const tgt = buildTargetJson(target);
  const scp = buildScopeJson(scope);

  const r = await IdServicePool.request()
    .input('Name', sql.NVarChar(200), name)
    .input('Day', sql.Date, day)
    .input('Status', sql.NVarChar(8), normStatus(status))
    .input('Target', sql.NVarChar(sql.MAX), tgt)
    .input('Scope', sql.NVarChar(sql.MAX), scp)
    .input('Desc', sql.NVarChar(sql.MAX), description)
    .input('User', sql.NVarChar(5), normUser5(user))
    .query(`
      INSERT INTO dbo.Holiday (Name, Day, Status, Target, Scope, Description, CreatedAt, UserCreated)
      OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Day, INSERTED.Status, INSERTED.Target, INSERTED.Scope,
             INSERTED.Description, INSERTED.CreatedAt, INSERTED.UpdatedAt, INSERTED.UserCreated, INSERTED.UserModified
      VALUES (@Name, @Day, @Status, @Target, @Scope, @Desc, SYSUTCDATETIME(), @User);
    `);

  return rowToApi(r.recordset[0]); 
}

// UPDATE
async function updateHoliday({ id, name, day, status, target, scope, description, user = 'API' }) {
  if (!Number.isInteger(id)) throw new Error('HOLIDAY_NOT_FOUND');
  if (day != null && !isIsoDate(day)) throw new Error('DAY_INVALID');

  await IdServicePoolConnect;


  const exists = (await IdServicePool.request()
    .input('id', sql.Int, id)
    .query('SELECT 1 ok FROM dbo.Holiday WHERE Id = @id')).recordset[0];
  if (!exists) throw new Error('HOLIDAY_NOT_FOUND');

  const hasTarget = target !== undefined;
  const hasScope  = scope  !== undefined;

  const tgt = hasTarget ? buildTargetJson(target) : null;
  const scp = hasScope  ? buildScopeJson(scope)   : null;


  const setParts = [
    'Name        = COALESCE(@Name, Name)',
    'Day         = COALESCE(@Day, Day)',
    'Status      = COALESCE(@Status, Status)',
    hasTarget ? 'Target = @Target' : null,
    hasScope  ? 'Scope  = @Scope'  : null,
    'Description = COALESCE(@Desc, Description)',
    'UpdatedAt   = SYSUTCDATETIME()',
    'UserModified= @User',
  ].filter(Boolean).join(',\n      ');

  const q = `
    UPDATE dbo.Holiday
    SET ${setParts}
    OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Day, INSERTED.Status, INSERTED.Target, INSERTED.Scope,
           INSERTED.Description, INSERTED.CreatedAt, INSERTED.UpdatedAt, INSERTED.UserCreated, INSERTED.UserModified
    WHERE Id = @Id;
  `;

  const req = IdServicePool.request()
    .input('Id',    sql.Int,            id)
    .input('Name',  sql.NVarChar(200),  name ?? null)
    .input('Day',   sql.Date,           day ?? null) 
    .input('Status',sql.NVarChar(8),    status != null ? normStatus(status) : null)
    .input('Target',sql.NVarChar(sql.MAX), tgt)
    .input('Scope', sql.NVarChar(sql.MAX), scp) 
    .input('Desc',  sql.NVarChar(sql.MAX), description ?? null)
    .input('User',  sql.NVarChar(5),    normUser5(user));

  const r = await req.query(q);           
  return rowToApi(r.recordset[0]);        
}


// GET BY ID
async function getHolidayById({ id }) {
  await IdServicePoolConnect;

  const row = (await IdServicePool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT Id, Name, Day, Status, Target, Scope, Description,
             CreatedAt, UpdatedAt, UserCreated, UserModified
      FROM dbo.Holiday WHERE Id = @id
    `)).recordset[0];

  if (!row) return null;
  return rowToApi(row);
}

// LIST (filtros + paginación)
async function listHolidays({ active = null, dateFrom = null, dateTo = null, q = null, page = 1, pageSize = 100 } = {}) {
  await IdServicePoolConnect;

  const where = [];
  const req = IdServicePool.request();

  if (active != null) {
    const st = normStatus(active);
    where.push('h.Status = @st');
    req.input('st', sql.NVarChar(8), st);
  }
  if (dateFrom) { where.push('h.Day >= @df'); req.input('df', sql.Date, dateFrom); }
  if (dateTo)   { where.push('h.Day <= @dt'); req.input('dt', sql.Date, dateTo); }
  if (q)        { where.push('h.Name LIKE @q'); req.input('q', sql.NVarChar(210), `%${q}%`); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const take = Math.max(1, Math.min(500, Number(pageSize) || 100));
  const skip = Math.max(0, ((Number(page) || 1) - 1) * take);
  req.input('Skip', sql.Int, skip).input('Take', sql.Int, take);

  const { recordset } = await req.query(`
    WITH page AS (
      SELECT h.Id
      FROM dbo.Holiday h
      ${whereSql}
      ORDER BY h.Day DESC, h.Id DESC
      OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY
    )
    SELECT h.Id, h.Name, h.Day, h.Status, h.Target, h.Scope, h.Description,
           h.CreatedAt, h.UpdatedAt, h.UserCreated, h.UserModified
    FROM page p
    JOIN dbo.Holiday h ON h.Id = p.Id
    ORDER BY h.Day DESC, h.Id DESC;
  `);

  return recordset.map(rowToApi);
}

// DELETE
async function deleteHoliday({ id }) {
  await IdServicePoolConnect;
  const r = await IdServicePool.request()
    .input('id', sql.Int, id)
    .query('DELETE FROM dbo.Holiday WHERE Id = @id; SELECT @@ROWCOUNT AS rc;');
  if ((r.recordset[0]?.rc || 0) === 0) throw new Error('HOLIDAY_NOT_FOUND');
  return { id };
}

module.exports = {
  createHoliday,
  updateHoliday,
  getHolidayById,
  listHolidays,
  deleteHoliday,
};
