// models/AccountModels.js
const { sql, IdServicePool, IdServicePoolConnect } = require('../config/dbnew');

// Prefijo de 3 letras desde Name (sin tildes/espacios)
function buildPrefix(name = '') {
  const onlyLetters = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
  return (onlyLetters.slice(0, 3).toUpperCase() || '').padEnd(3, 'X');
}

// Siguiente ReferenceId por prefijo con locks (evita duplicados en concurrencia)
async function getNextReferenceId(tx, prefix) {
  const req = new sql.Request(tx);
  req.input('prefix', sql.VarChar(10), prefix);
  const q = `
    SELECT MAX(TRY_CONVERT(int, PARSENAME(REPLACE(ReferenceId,'-','.'), 1))) AS maxSeq
    FROM Account WITH (UPDLOCK, HOLDLOCK)
    WHERE ReferenceId LIKE @prefix + '-%';
  `;
  const rs = await req.query(q);
  const maxSeq = rs.recordset[0]?.maxSeq || 0;
  const next = String(maxSeq + 1).padStart(3, '0'); // 001, 002, ...
  return `${prefix}-${next}`;
}

/**
 * Crea un Account
 * payload:
 *  - SalesChannelId (req) int (FK a Sales_Channel.Id)
 *  - Name (req)           nvarchar
 *  - Platform (req)       nvarchar
 *  - EcommerceName        nvarchar|null
 *  - Features             string JSON|null (si envías objeto, conviértelo antes)
 *  - Status               bit/int (0/1) default 1
 *  - DateCreatedStr (req) string "yyyy-MM-dd HH:mm:ss.SSS" (America/Santiago)
 *  - UserCreated          int|null
 */
async function createAccount(payload) {
  await IdServicePoolConnect;

  const {
    SalesChannelId,
    Name,
    Platform,
    EcommerceName = null,
    Features = null,
    Status = 1,
    DateCreatedStr,
    UserCreated = null,
  } = payload;

  if (!SalesChannelId) throw new Error('SalesChannelId es obligatorio');
  if (!Name)          throw new Error('Name es obligatorio');
  if (!Platform)      throw new Error('Platform es obligatorio');
  if (!DateCreatedStr)throw new Error('DateCreatedStr es obligatorio');

  const tx = new sql.Transaction(IdServicePool);
  await tx.begin();

  try {
    const prefix = buildPrefix(Name);
    const ReferenceId = await getNextReferenceId(tx, prefix);

    const q = `
      INSERT INTO Account (
        SalesChannelId, ReferenceId, Name, Platform, EcommerceName,
        Features, Status, DateCreated, DateModified, UserCreated, UserModified
      )
      OUTPUT INSERTED.*
      VALUES (
        @SalesChannelId, @ReferenceId, @Name, @Platform, @EcommerceName,
        @Features, @Status, CONVERT(datetime, @DateCreatedStr, 121), NULL, @UserCreated, NULL
      );
    `;

    const r = new sql.Request(tx);
    r.input('SalesChannelId', sql.Int,           Number(SalesChannelId));
    r.input('ReferenceId',    sql.NVarChar(100), ReferenceId);
    r.input('Name',           sql.NVarChar(200), String(Name).trim());
    r.input('Platform',       sql.NVarChar(100), String(Platform).trim());
    r.input('EcommerceName',  sql.NVarChar(200), EcommerceName);
    r.input('Features',       sql.NVarChar(sql.MAX), Features);
    r.input('Status',         sql.Int,           Status ? 1 : 0);
    r.input('DateCreatedStr', sql.VarChar(23),   DateCreatedStr);
    r.input('UserCreated',    sql.Int,           UserCreated);

    const rs = await r.query(q);
    await tx.commit();
    return rs.recordset[0];
  } catch (err) {
    try { await tx.rollback(); } catch {}
    throw err;
  }
}

async function getAccountById(id) {
  await IdServicePoolConnect;

  const q = `
    SELECT 
      a.Id,
      a.SalesChannelId,
      sc.Name AS SalesChannelName,
      a.ReferenceId,
      a.Name,
      a.Platform,
      a.EcommerceName,
      a.Features,
      a.Status,
      a.DateCreated,
      a.DateModified,
      a.UserCreated,
      a.UserModified
    FROM Account a
    INNER JOIN Sales_Channel sc ON sc.Id = a.SalesChannelId
    WHERE a.Id = @Id;
  `;

  const r = new sql.Request(IdServicePool);
  r.input('Id', sql.Int, id);

  const rs = await r.query(q);
  return rs.recordset[0] || null;
}
//GET LIST OF ACCOUNTS
async function listAccounts({ page = 1, pageSize = 10, filters = {} }) {
  await IdServicePoolConnect;

  const offset = (page - 1) * pageSize;
  const where = [];

  if (filters.name)            where.push('a.Name LIKE @name');
  if (filters.platform)        where.push('a.Platform LIKE @platform');
  if (filters.ecommerceName)   where.push('a.EcommerceName LIKE @ecommerceName');
  if (filters.salesChannelName)where.push('sc.Name LIKE @salesChannelName');
  if (filters.status !== undefined && filters.status !== null && filters.status !== '')
                               where.push('a.Status = @status');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(1) AS total
    FROM Account a
    INNER JOIN Sales_Channel sc ON sc.Id = a.SalesChannelId
    ${whereSql};
  `;

  const pageSql = `
    SELECT
      a.Id,
      a.SalesChannelId,
      sc.Name AS SalesChannelName,
      a.ReferenceId,
      a.Name,
      a.Platform,
      a.EcommerceName,
      a.Features,
      a.Status,
      a.DateCreated,
      a.DateModified,
      a.UserCreated,
      a.UserModified
    FROM Account a
    INNER JOIN Sales_Channel sc ON sc.Id = a.SalesChannelId
    ${whereSql}
    ORDER BY a.DateCreated DESC, a.Id DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  const r = new sql.Request(IdServicePool);

  if (filters.name)              r.input('name', sql.NVarChar(220), `%${filters.name}%`);
  if (filters.platform)          r.input('platform', sql.NVarChar(120), `%${filters.platform}%`);
  if (filters.ecommerceName)     r.input('ecommerceName', sql.NVarChar(220), `%${filters.ecommerceName}%`);
  if (filters.salesChannelName)  r.input('salesChannelName', sql.NVarChar(220), `%${filters.salesChannelName}%`);
  if (filters.status !== undefined && filters.status !== null && filters.status !== '')
                                 r.input('status', sql.Int, Number(filters.status) ? 1 : 0);

  r.input('offset', sql.Int, offset);
  r.input('pageSize', sql.Int, pageSize);

  const result = await r.query(`${countSql} ${pageSql}`);
  const total = result.recordsets[0][0]?.total || 0;
  const data  = result.recordsets[1] || [];

  return { page, pageSize, total, data };
}
async function updateAccountById(id, payload) {
  await IdServicePoolConnect;

  const {
    Name = null,
    Platform = null,
    EcommerceName = null,
    Features = null,   
    Status = null,
    DateModifiedStr,  
    UserModified
  } = payload;

  if (!DateModifiedStr) throw new Error('DateModifiedStr es obligatorio');
  if (UserModified === null || UserModified === undefined) {
    throw new Error('UserModified es obligatorio');
  }

  const q = `
    UPDATE a
    SET
      a.Name         = COALESCE(@Name, a.Name),
      a.Platform     = COALESCE(@Platform, a.Platform),
      a.EcommerceName= COALESCE(@EcommerceName, a.EcommerceName),
      a.Features     = COALESCE(@Features, a.Features),
      a.Status       = COALESCE(@Status, a.Status),
      a.DateModified = CONVERT(datetime2(3), @DateModifiedStr, 121),
      a.UserModified = @UserModified
    FROM Account a
    WHERE a.Id = @Id;

    SELECT *
    FROM Account a
    WHERE a.Id = @Id;
  `;

  const r = new sql.Request(IdServicePool);
  r.input('Id',            sql.Int,           id);
  r.input('Name',          sql.NVarChar(200), Name);
  r.input('Platform',      sql.NVarChar(100), Platform);
  r.input('EcommerceName', sql.NVarChar(200), EcommerceName);
  r.input('Features',      sql.NVarChar(sql.MAX), Features);
  r.input('Status',        sql.Int,           Status === null ? null : Number(Status));
  r.input('DateModifiedStr', sql.VarChar(23), DateModifiedStr);
  r.input('UserModified',  sql.Int,           UserModified);

  const rs = await r.query(q);
  return rs.recordset[0] || null;
}
/**
 * Inserta múltiples Accounts, continuando en caso de error por item.
 * items normalizados: { SalesChannelId, Name, Platform, EcommerceName, Features(str/null), Status, DateCreatedStr, UserCreated }
 * @returns { inserted: any[], errors: Array<{index:number, SalesChannelId:number, Name:string, code:string, number:number|null, message:string}> }
 */
async function createAccountsBulk(items) {
  const inserted = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const row = await createAccount({
        SalesChannelId: it.SalesChannelId,
        Name: it.Name,
        Platform: it.Platform,
        EcommerceName: it.EcommerceName ?? null,
        Features: it.Features ?? null, // debe venir ya como string o null
        Status: it.Status ?? 1,
        DateCreatedStr: it.DateCreatedStr || nowSCLSql121(),
        UserCreated: it.UserCreated ?? null,
      });
      inserted.push(row);
    } catch (err) {
      const num =
        err?.number ??
        err?.originalError?.info?.number ??
        err?.originalError?.number ??
        err?.precedingErrors?.[0]?.number ??
        null;

      const msg = err?.originalError?.info?.message || err?.message || 'Error desconocido';

      let code = 'UNKNOWN';
      let message = 'Error insertando account';
      if (num === 547) {
        code = 'FK_VIOLATION';
        message = 'SalesChannelId no existe o viola la restricción de la base de datos.';
      } else if (num === 2627 || num === 2601) {
        if (/ReferenceId/i.test(msg)) {
          code = 'UNIQUE_REFERENCEID';
          message = 'ReferenceId duplicado.';
        } else if (/UX_Account_SalesChannel_Name/i.test(msg) || /UNIQUE.*SalesChannelId.*Name/i.test(msg)) {
          code = 'UNIQUE_NAME_BY_CHANNEL';
          message = 'Ya existe una cuenta con ese Name en el mismo SalesChannel.';
        } else {
          code = 'UNIQUE_VIOLATION';
          message = 'Violación de restricción única.';
        }
      }

      errors.push({
        index: i,
        SalesChannelId: it.SalesChannelId,
        Name: it.Name,
        code,
        number: num,
        message,
      });
      // continúa con el siguiente
    }
  }

  return { inserted, errors };
}

async function getAccountFeaturesById(id) {
  await IdServicePoolConnect;

  const q = `
    SELECT 
      a.Features
    FROM Account a
    WHERE a.Id = @Id;
  `;

  const r = new sql.Request(IdServicePool);
  r.input('Id', sql.Int, id);

  const rs = await r.query(q);
  return rs.recordset[0] || null;
}

module.exports = { createAccount, getAccountById, listAccounts, updateAccountById, createAccountsBulk, getAccountFeaturesById };
