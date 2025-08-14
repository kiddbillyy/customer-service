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

/**
 * Crea un Sales_Channel
 * payload:
 *  - CompanyId (req)        int (FK a Company.Id)
 *  - Name (req)             nvarchar
 *  - ExternalDelivery       bit/int (0/1)
 *  - IsActive               bit/int (0/1)  (default 1)
 *  - CreatedAtStr (req)     string 'yyyy-MM-dd HH:mm:ss.SSS' (America/Santiago)
 *  - UserCreated            int|null
 */
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

module.exports = { createSalesChannel };
