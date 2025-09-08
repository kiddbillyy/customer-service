// models/StoreModels.js
const { sql, IdServicePool, IdServicePoolConnect } = require('../config/dbnew');


async function createStore(payload) {
  await IdServicePoolConnect;

  const {
    CompanyId,
    Name,
    Email,
    PhoneNumber,
    Status = 1,
    CreatedAtStr,
    UserCreated = null,
  } = payload;

  if (!CompanyId) throw new Error('CompanyId es obligatorio');
  if (!Name) throw new Error('Name es obligatorio');

  const insertSql = `
    INSERT INTO Store (
      CompanyId, Name, Email, PhoneNumber,
      Status, CreatedAt, UpdatedAt, UserCreated, UserModified
    )
    OUTPUT INSERTED.*
    VALUES (
      @CompanyId, @Name, @Email, @PhoneNumber,
      @Status, CONVERT(datetime2(3), @CreatedAtStr, 121), NULL, @UserCreated, NULL
    );
  `;

  const r = new sql.Request(IdServicePool);
  r.input('CompanyId',     sql.Int,            CompanyId);
  r.input('Name',          sql.NVarChar(200),  Name);
  r.input('Email',         sql.NVarChar(200),  Email || null);
  r.input('PhoneNumber',   sql.NVarChar(50),   PhoneNumber || null);
  r.input('Status',        sql.Int,            Status);
  r.input('CreatedAtStr',  sql.VarChar(23),    CreatedAtStr);
  r.input('UserCreated',   sql.Int,            UserCreated);

  const result = await r.query(insertSql);
  return result.recordset[0];
}
async function getStoreById(storeId) {
  await IdServicePoolConnect;

  const q = `
    SELECT
      s.Id,
      s.CompanyId,
      s.Name,
      s.Email,
      s.PhoneNumber,
      s.Status,
      s.CreatedAt,
      s.UpdatedAt,
      s.UserCreated,
      s.UserModified,
      c.LegalName AS CompanyName
    FROM Store s
    INNER JOIN Company c ON s.CompanyId = c.Id
    WHERE s.Id = @Id;
  `;

  const r = new sql.Request(IdServicePool);
  r.input('Id', sql.Int, storeId);

  const result = await r.query(q);
  return result.recordset[0] || null;
}

/**
 * Lista de stores con paginación y filtros.
 * params:
 *  - page (default 1)
 *  - pageSize (default 10)
 *  - filters: { search, status, companyId }
 *    - search: busca en CompanyName, Store.Name, Email, PhoneNumber
 *    - status: 0/1
 *    - companyId: filtra por empresa
 */
async function listStores({ page = 1, pageSize = 10, filters = {} }) {
  await IdServicePoolConnect;

  const offset = (page - 1) * pageSize;
  const where = [];

  if (filters.search) {
    where.push(`
      (
        c.LegalName LIKE @search OR
        s.Name LIKE @search OR
        s.Email LIKE @search OR
        s.PhoneNumber LIKE @search
      )
    `);
  }
  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    where.push(`s.Status = @status`);
  }
  if (filters.companyId) {
    where.push(`s.CompanyId = @companyId`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(1) AS total
    FROM Store s
    INNER JOIN Company c ON c.Id = s.CompanyId
    ${whereSql};
  `;

  const pageSql = `
    SELECT
      s.Id,
      s.CompanyId,
      c.LegalName AS CompanyName,
      s.Name,
      s.Email,
      s.PhoneNumber,
      s.Status,
      s.CreatedAt,
      s.UpdatedAt,
      s.UserCreated,
      s.UserModified
    FROM Store s
    INNER JOIN Company c ON c.Id = s.CompanyId
    ${whereSql}
    ORDER BY s.CreatedAt DESC, s.Id DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  const r = new sql.Request(IdServicePool);
  if (filters.search) r.input('search', sql.NVarChar(200), `%${filters.search}%`);
  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    r.input('status', sql.Int, Number(filters.status));
  }
  if (filters.companyId) r.input('companyId', sql.Int, Number(filters.companyId));
  r.input('offset', sql.Int, offset);
  r.input('pageSize', sql.Int, pageSize);

  const result = await r.query(`${countSql} ${pageSql}`);
  const total = result.recordsets[0][0]?.total || 0;
  const data = result.recordsets[1] || [];

  return { page, pageSize, total, data };
}
/**
 * Actualiza parcialmente un Store por Id.
 * Campos actualizables: Name, Email, PhoneNumber, Status
 * Requiere: UpdatedAtStr (string SCL) y UserModified (int)
 */
async function updateStoreById(id, payload) {
  await IdServicePoolConnect;

  const {
    Name = null,
    Email = null,
    PhoneNumber = null,
    Status = null,
    UpdatedAtStr,       // "yyyy-MM-dd HH:mm:ss.SSS" America/Santiago
    UserModified        // int
  } = payload;

  if (!UpdatedAtStr) throw new Error('UpdatedAtStr es obligatorio');
  if (!UserModified && UserModified !== 0) throw new Error('UserModified es obligatorio');

  const q = `
    UPDATE s
    SET
      s.Name        = COALESCE(@Name, s.Name),
      s.Email       = COALESCE(@Email, s.Email),
      s.PhoneNumber = COALESCE(@PhoneNumber, s.PhoneNumber),
      s.Status      = COALESCE(@Status, s.Status),
      s.UpdatedAt   = CONVERT(datetime2(3), @UpdatedAtStr, 121),
      s.UserModified= @UserModified
    FROM Store s
    WHERE s.Id = @Id;
  `;

  const r = new sql.Request(IdServicePool);
  r.input('Id',           sql.Int,           id);
  r.input('Name',         sql.NVarChar(200), Name);
  r.input('Email',        sql.NVarChar(200), Email);
  r.input('PhoneNumber',  sql.NVarChar(50),  PhoneNumber);
  r.input('Status',       sql.Int,           Status === null ? null : Number(Status));
  r.input('UpdatedAtStr', sql.VarChar(23),   UpdatedAtStr);
  r.input('UserModified', sql.Int,           UserModified);

  const result = await r.query(q);

  // result.rowsAffected es un array con el número de filas afectadas por cada instrucción
  return result.rowsAffected[0] > 0;
}


async function listStoresBasic({ page = 1, pageSize = 10, filters = {} }) {
  await IdServicePoolConnect;

  const offset = (page - 1) * pageSize;
  const where = [];

  // Filtros básicos
  if (filters.search) {
    where.push(`s.Name LIKE @search`);
  }
  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    where.push(`s.Status = @status`);
  }
  if (filters.companyId) {
    where.push(`s.CompanyId = @companyId`);
  }

  // Filtro hasAddress (usa EXISTS / NOT EXISTS sobre Location)
  if (filters.hasAddress === true) {
    where.push(`EXISTS (SELECT 1 FROM Location l WHERE l.StoreId = s.Id)`);
  } else if (filters.hasAddress === false) {
    where.push(`NOT EXISTS (SELECT 1 FROM Location l WHERE l.StoreId = s.Id)`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(1) AS total
    FROM Store s
    ${whereSql};
  `;

  const pageSql = `
    SELECT
      s.Id,
      s.Name
    FROM Store s
    ${whereSql}
    ORDER BY s.CreatedAt DESC, s.Id DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  const r = new sql.Request(IdServicePool);
  if (filters.search)  r.input('search', sql.NVarChar(200), `%${filters.search}%`);
  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    r.input('status', sql.Int, Number(filters.status));
  }
  if (filters.companyId) r.input('companyId', sql.Int, Number(filters.companyId));
  r.input('offset', sql.Int, offset);
  r.input('pageSize', sql.Int, pageSize);

  const result = await r.query(`${countSql} ${pageSql}`);
  const total = result.recordsets[0][0]?.total || 0;
  const data  = result.recordsets[1] || [];

  return { page, pageSize, total, data };
}


module.exports = { createStore, getStoreById, listStores, updateStoreById, listStoresBasic };
