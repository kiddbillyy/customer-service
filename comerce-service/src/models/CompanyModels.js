const { sql, IdServicePool, IdServicePoolConnect } = require('../config/dbnew');

// Limpia y arma prefijo de 3 letras a partir del LegalName
function buildPrefix(legalName = '') {
  const onlyLetters = legalName
    .normalize('NFD')                    // separa acentos
    .replace(/[\u0300-\u036f]/g, '')    // quita diacríticos
    .replace(/[^a-zA-Z]/g, '');         // solo letras

  const prefix = (onlyLetters.slice(0, 3).toUpperCase() || '').padEnd(3, 'X');
  return prefix;
}

// Obtiene el correlativo siguiente para un prefijo, con locks para concurrencia
async function getNextReferenceId(tx, prefix) {
  const req = new sql.Request(tx);
  req.input('prefix', sql.VarChar(10), prefix);

  // UPDLOCK + HOLDLOCK serializa por prefijo y evita carreras
  const q = `
    SELECT MAX(TRY_CONVERT(int, PARSENAME(REPLACE(ReferenceId, '-', '.'), 1))) AS maxSeq
    FROM Company WITH (UPDLOCK, HOLDLOCK)
    WHERE ReferenceId LIKE @prefix + '-%';
  `;
  const rs = await req.query(q);
  const maxSeq = rs.recordset[0]?.maxSeq || 0;
  const nextSeq = maxSeq + 1;
  const code = String(nextSeq).padStart(3, '0'); // 001, 002, ...
  return `${prefix}-${code}`;
}

async function createCompany(payload) {
  await IdServicePoolConnect;

  // 1) preparar datos base
  const {
    LegalName,
    BusinessName,
    Tax,
    Email,
    PhoneNumber,
    DocumentType,
    DocumentNumber,
    WebsiteUrl,
    Industry,
    Status = 1,
    CreatedAtStr,          // viene del controller (hora SCL en string)
    UserCreated = null
  } = payload;

  if (!LegalName) {
    throw new Error('LegalName es obligatorio');
  }

  // 2) transacción para generar ReferenceId + insertar
  const tx = new sql.Transaction(IdServicePool);
  await tx.begin(); // READ COMMITTED por defecto

  try {
    const prefix = buildPrefix(LegalName);
    const ReferenceId = await getNextReferenceId(tx, prefix);

    const insertSql = `
      INSERT INTO Company (
        ReferenceId, LegalName, BusinessName, Tax, Email, PhoneNumber,
        DocumentType, DocumentNumber, WebsiteUrl, Industry,
        Status, CreatedAt, UpdatedAt, UserCreated, UserModified
      )
      OUTPUT INSERTED.*
      VALUES (
        @ReferenceId, @LegalName, @BusinessName, @Tax, @Email, @PhoneNumber,
        @DocumentType, @DocumentNumber, @WebsiteUrl, @Industry,
        @Status, CONVERT(datetime2(3), @CreatedAtStr, 121), NULL, @UserCreated, NULL
      );
    `;

    const r = new sql.Request(tx);
    r.input('ReferenceId',   sql.NVarChar(100), ReferenceId);
    r.input('LegalName',     sql.NVarChar(200), LegalName);
    r.input('BusinessName',  sql.NVarChar(200), BusinessName || null);
    r.input('Tax',           sql.NVarChar(50),  Tax || null);
    r.input('Email',         sql.NVarChar(200), Email || null);
    r.input('PhoneNumber',   sql.NVarChar(50),  PhoneNumber || null);
    r.input('DocumentType',  sql.NVarChar(50),  DocumentType || null);
    r.input('DocumentNumber',sql.NVarChar(100), DocumentNumber || null);
    r.input('WebsiteUrl',    sql.NVarChar(300), WebsiteUrl || null);
    r.input('Industry',      sql.NVarChar(100), Industry || null);
    r.input('Status',        sql.Int,           Status);
    r.input('CreatedAtStr',  sql.VarChar(23),   CreatedAtStr);
    r.input('UserCreated',   sql.Int,           UserCreated);

    const rs = await r.query(insertSql);
    await tx.commit();
    return rs.recordset[0];
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}


//GET ONE COMPANY
const BASE_SELECT = `
  SELECT TOP 1
    Id,
    ReferenceId,
    LegalName,
    BusinessName,
    Tax,
    Email,
    PhoneNumber,
    DocumentType,
    DocumentNumber,
    Status,
    Industry,
    CreatedAt,
    UserCreated,
    UpdatedAt,
    UserModified
  FROM Company
`;

async function getCompanyById(companyId) {
  const pool = await IdServicePool;
  const result = await pool.request()
    .input('Id', sql.Int, companyId) // Usa sql.BigInt si corresponde
    .query(`${BASE_SELECT} WHERE Id = @Id`);
  return result.recordset[0] || null;
}

async function getCompanyByReferenceId(referenceId) {
  const pool = await IdServicePool;

  // Detectar si parece GUID (opcional, por si quieres soportar ambos tipos)
  const looksLikeGuid = /^[0-9a-fA-F-]{36}$/.test(referenceId);

  const request = pool.request();
  if (looksLikeGuid) {
    request.input('ReferenceId', sql.UniqueIdentifier, referenceId);
  } else {
    // Cambia el largo si tu columna es VARCHAR(N) / NVARCHAR(N)
    request.input('ReferenceId', sql.VarChar(100), referenceId);
  }

  const result = await request.query(`${BASE_SELECT} WHERE ReferenceId = @ReferenceId`);
  return result.recordset[0] || null;
}

async function getAllCompanies(orderBy = 'LegalName', orderDir = 'ASC') {
  const pool = await IdServicePool;

  // Seguridad: evitar SQL injection en orderBy / orderDir
  const validOrderBy = ['LegalName', 'DocumentNumber', 'CreatedAt', 'Status'];
  const validOrderDir = ['ASC', 'DESC'];

  if (!validOrderBy.includes(orderBy)) orderBy = 'LegalName';
  if (!validOrderDir.includes(orderDir.toUpperCase())) orderDir = 'ASC';

  const query = `
    SELECT
      Id,
      ReferenceId,
      LegalName,
      BusinessName,
      Tax,
      Email,
      PhoneNumber,
      DocumentType,
      DocumentNumber,
      Status,
      Industry,
      CreatedAt,
      UserCreated,
      UpdatedAt,
      UserModified
    FROM Company
    ORDER BY ${orderBy} ${orderDir}
  `;

  const result = await pool.request().query(query);
  return result.recordset;
}

// Actualizar Compañía
const SELECT_FIELDS = `
  Id,
  ReferenceId,
  LegalName,
  BusinessName,
  Tax,
  Email,
  PhoneNumber,
  DocumentType,
  DocumentNumber,
  Status,
  Industry,
  CreatedAt,
  UserCreated,
  UpdatedAt,
  UserModified
`;

const UPDATABLE_FIELDS = [
  'LegalName',
  'BusinessName',
  'Tax',
  'Email',
  'PhoneNumber',
  'DocumentType',
  'DocumentNumber',
  'Status',
  'Industry'
];

/**
 * Actualiza solo los campos presentes en payload (whitelist UPDATABLE_FIELDS),
 * además de UpdatedAt y UserModified.
 * Retorna el registro actualizado.
 */
async function updateCompanyById(id, payload) {
  const pool = await IdServicePool;

  // filtrar campos permitidos presentes
  const fields = UPDATABLE_FIELDS.filter(k => Object.prototype.hasOwnProperty.call(payload, k));
  if (fields.length === 0) {
    const e = new Error('No hay campos para actualizar');
    e.code = 'NO_FIELDS';
    throw e;
  }

  const setClauses = fields.map(f => `[${f}] = @${f}`).join(', ');
  const sqlText = `
    UPDATE Company
    SET ${setClauses}${setClauses ? ', ' : ''} UpdatedAt = @UpdatedAt, UserModified = @UserModified
    WHERE Id = @Id;

    SELECT ${SELECT_FIELDS}
    FROM Company
    WHERE Id = @Id;
  `;

  const req = pool.request();
  req.input('Id', sql.Int, id);

  // Tipos: usa NVarChar para textos; Int para Status (si viene)
  for (const f of fields) {
    if (f === 'Status') {
      req.input('Status', sql.Int, payload.Status);
    } else {
      // usa NVARCHAR(MAX) por simplicidad; ajusta tamaños si lo prefieres
      req.input(f, sql.NVarChar, payload[f]);
    }
  }

  req.input('UpdatedAt', sql.NVarChar, payload.UpdatedAtStr); // tu util devuelve string SQL-121
  req.input('UserModified', sql.Int, payload.UserModified);

  const result = await req.query(sqlText);
  const updated = result.recordset?.[0];

  if (!updated) {
    const e = new Error('Compañía no encontrada');
    e.code = 'NOT_FOUND';
    throw e;
  }
  return updated;
}
module.exports = { createCompany, getCompanyById, getCompanyByReferenceId, getAllCompanies, updateCompanyById };
