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

module.exports = { createStore };
