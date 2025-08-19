// models/SalesChannelModels.js
const { sql, IdServicePool, IdServicePoolConnect } = require('../config/dbnew');

// Prefijo de 3 letras basado en Name (sin acentos ni símbolos)
function buildPrefix(name = '') {
  const onlyLetters = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
  return (onlyLetters.slice(0, 3).toUpperCase() || '').padEnd(3, 'X');
}

// Obtiene correlativo siguiente por prefijo (evita colisiones con locks)
async function getNextReferenceId(tx, prefix) {
  const req = new sql.Request(tx);
  req.input('prefix', sql.VarChar(10), prefix);

  const q = `
    SELECT MAX(TRY_CONVERT(int, PARSENAME(REPLACE(ReferenceId,'-','.'), 1))) AS maxSeq
    FROM Sales_Channel WITH (UPDLOCK, HOLDLOCK)
    WHERE ReferenceId LIKE @prefix + '-%';
  `;
  const rs = await req.query(q);
  const maxSeq = rs.recordset[0]?.maxSeq || 0;
  const code = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}-${code}`;
}

// CREATE SALES CHANNEL
async function createSalesChannel(payload) {
  await IdServicePoolConnect;

  const {
    CompanyId,
    Name,
    ExternalDelivery = 0,
    IsActive = 1,
    CreatedAtStr,
    UserCreated = null,
  } = payload;

  if (!CompanyId) throw new Error('CompanyId es obligatorio');
  if (!Name) throw new Error('Name es obligatorio');
  if (!CreatedAtStr) throw new Error('CreatedAtStr es obligatorio');

  const tx = new sql.Transaction(IdServicePool);
  await tx.begin();
  try {
    const prefix = buildPrefix(Name);
    const ReferenceId = await getNextReferenceId(tx, prefix);

    const insertSql = `
      INSERT INTO Sales_Channel (
        CompanyId, ReferenceId, Name, ExternalDelivery, IsActive,
        CreatedAt, UpdatedAt, UserCreated, UserModified
      )
      OUTPUT INSERTED.*
      VALUES (
        @CompanyId, @ReferenceId, @Name, @ExternalDelivery, @IsActive,
        CONVERT(datetime2(3), @CreatedAtStr, 121), NULL, @UserCreated, NULL
      );
    `;

    const r = new sql.Request(tx);
    r.input('CompanyId',        sql.Int,           CompanyId);
    r.input('ReferenceId',      sql.NVarChar(100), ReferenceId);
    r.input('Name',             sql.NVarChar(200), Name);
    r.input('ExternalDelivery', sql.Int,           ExternalDelivery ? 1 : 0);
    r.input('IsActive',         sql.Int,           IsActive ? 1 : 0);
    r.input('CreatedAtStr',     sql.VarChar(23),   CreatedAtStr);
    r.input('UserCreated',      sql.Int,           UserCreated);

    const rs = await r.query(insertSql);
    await tx.commit();
    return rs.recordset[0];
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}
// CREATE MASSIVE

/**
 * Inserta múltiples Sales_Channel, continuando en caso de error por item.
 * @param {Array} items  Arreglo normalizado con: CompanyId, Name, ExternalDelivery, IsActive, CreatedAtStr, UserCreated
 * @returns {Object} { inserted: [...], errors: [...] }
 */
async function createSalesChannelsBulk(items) {
  const inserted = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const ch = items[i];
    try {
      const row = await createSalesChannel(ch); // usa la lógica existente (con ReferenceId y todo)
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
      let message = 'Error insertando canal de venta';
      if (num === 547) {
        code = 'FK_VIOLATION';
        message = 'CompanyId no existe o viola restricción de la base de datos.';
      } else if (num === 2627 || num === 2601) {
        code = /UX_SalesChannel_Name/i.test(msg) ? 'UNIQUE_NAME' : 'UNIQUE_VIOLATION';
        message = 'Ya existe un canal de venta registrado con este nombre para la compañía.';
      }

      errors.push({
        index: i,
        CompanyId: ch.CompanyId,
        Name: ch.Name,
        code,
        number: num,
        message,
      });
      // continúa con el siguiente item
    }
  }

  return { inserted, errors };
}

//GET SALES CHANNELS (LIST)
async function listSalesChannels({ page = 1, pageSize = 10, filters = {} }) {
  await IdServicePoolConnect;

  const offset = (page - 1) * pageSize;
  const where = [];

  if (filters.search) {
    where.push(`(c.LegalName LIKE @search OR sc.Name LIKE @search)`);
  }
  if (filters.companyId) {
    where.push(`sc.CompanyId = @companyId`);
  }
  if (filters.isActive !== undefined && filters.isActive !== null && filters.isActive !== '') {
    where.push(`sc.IsActive = @isActive`);
  }
  if (filters.externalDelivery !== undefined && filters.externalDelivery !== null && filters.externalDelivery !== '') {
    where.push(`sc.ExternalDelivery = @externalDelivery`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(1) AS total
    FROM Sales_Channel sc
    INNER JOIN Company c ON c.Id = sc.CompanyId
    ${whereSql};
  `;

  const pageSql = `
    SELECT
      sc.Id,
      sc.CompanyId,
      c.LegalName AS CompanyName,
      sc.ReferenceId,
      sc.Name,
      sc.ExternalDelivery,
      sc.IsActive,
      sc.CreatedAt,
      sc.UpdatedAt,
      sc.UserCreated,
      sc.UserModified
    FROM Sales_Channel sc
    INNER JOIN Company c ON c.Id = sc.CompanyId
    ${whereSql}
    ORDER BY sc.CreatedAt DESC, sc.Id DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  const r = new sql.Request(IdServicePool);
  if (filters.search) r.input('search', sql.NVarChar(200), `%${filters.search}%`);
  if (filters.companyId) r.input('companyId', sql.Int, Number(filters.companyId));
  if (filters.isActive !== undefined && filters.isActive !== null && filters.isActive !== '') {
    r.input('isActive', sql.Int, Number(filters.isActive));
  }
  if (filters.externalDelivery !== undefined && filters.externalDelivery !== null && filters.externalDelivery !== '') {
    r.input('externalDelivery', sql.Int, Number(filters.externalDelivery));
  }
  r.input('offset', sql.Int, offset);
  r.input('pageSize', sql.Int, pageSize);

  const result = await r.query(`${countSql} ${pageSql}`);
  const total = result.recordsets[0][0]?.total || 0;
  const data = result.recordsets[1] || [];

  return { page, pageSize, total, data };
}
//GET SALES CHANNEL BY ID
async function getSalesChannelById(id) {
  await IdServicePoolConnect;

  const q = `
    SELECT
      sc.Id,
      sc.CompanyId,
      c.LegalName AS CompanyName,
      sc.ReferenceId,
      sc.Name,
      sc.ExternalDelivery,
      sc.IsActive,
      sc.CreatedAt,
      sc.UpdatedAt,
      sc.UserCreated,
      sc.UserModified
    FROM Sales_Channel sc
    INNER JOIN Company c ON c.Id = sc.CompanyId
    WHERE sc.Id = @id;
  `;

  const r = new sql.Request(IdServicePool);
  r.input('id', sql.Int, id);

  const rs = await r.query(q);
  return rs.recordset[0] || null;
}
// UPDATE SALES CHANNEL
async function updateSalesChannelById(id, payload) {
  await IdServicePoolConnect;

  const {
    Name = null,
    ExternalDelivery = null,
    IsActive = null,
    UpdatedAtStr,
    UserModified,
  } = payload;

  if (!UpdatedAtStr) throw new Error('UpdatedAtStr es obligatorio');
  if (UserModified === null || UserModified === undefined) {
    throw new Error('UserModified es obligatorio');
  }

  const q = `
    UPDATE sc
    SET
      sc.Name            = COALESCE(@Name, sc.Name),
      sc.ExternalDelivery= COALESCE(@ExternalDelivery, sc.ExternalDelivery),
      sc.IsActive        = COALESCE(@IsActive, sc.IsActive),
      sc.UpdatedAt       = CONVERT(datetime2(3), @UpdatedAtStr, 121),
      sc.UserModified    = @UserModified
    FROM Sales_Channel sc
    WHERE sc.Id = @Id;

    SELECT sc.Id
    FROM Sales_Channel sc
    WHERE sc.Id = @Id;
  `;

  const r = new sql.Request(IdServicePool);
  r.input('Id', sql.Int, id);
  r.input('Name', sql.NVarChar(200), Name);
  r.input('ExternalDelivery', sql.Int, ExternalDelivery === null ? null : Number(ExternalDelivery));
  r.input('IsActive', sql.Int, IsActive === null ? null : Number(IsActive));
  r.input('UpdatedAtStr', sql.VarChar(23), UpdatedAtStr);
  r.input('UserModified', sql.Int, UserModified);

  const rs = await r.query(q);
  return rs.recordset[0] || null;
}



module.exports = { createSalesChannel, listSalesChannels, getSalesChannelById, updateSalesChannelById, createSalesChannelsBulk };
