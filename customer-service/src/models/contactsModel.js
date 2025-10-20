import { getPool, sql } from '../config/db.js';

export async function upsertContact(customerId, c) {
  const pool = await getPool();

  const code = String(c.contactCode ?? '').trim();
  if (!code) {
    return null; // o lanza error si prefieres
  }

  // ¿Existe ese ContactCode? (PK global)
  const ownerRS = await pool.request()
    .input('ContactCode', sql.NVarChar(50), code)
    .query(`SELECT CustomerId FROM dbo.CustomerContacts WITH (NOLOCK) WHERE ContactCode=@ContactCode;`);

  const ownerId = ownerRS.recordset[0]?.CustomerId;
  if (ownerId && ownerId !== customerId) {
    // el código pertenece a otro cliente
    throw Object.assign(new Error('CONTACT_CODE_TAKEN'), {
      http: 409,
      payload: { error: 'CONTACT_CODE_TAKEN', contactCode: code, ownerId }
    });
  }

  // Normalización de campos
  const norm = (v, m) => (v == null ? null : String(v).trim().slice(0, m));

  // Upsert: si existe -> UPDATE; si no -> INSERT
  if (ownerId) {
    await pool.request()
      .input('ContactCode', sql.NVarChar(50), code)
      .input('Name',        sql.NVarChar(100), norm(c.name, 100))
      .input('Position',    sql.NVarChar(100), norm(c.position, 100))
      .input('EMail',       sql.NVarChar(255), norm(c.eMail, 255))
      .input('Phone1',      sql.NVarChar(40),  norm(c.phone1, 40))
      .input('Phone2',      sql.NVarChar(40),  norm(c.phone2, 40))
      .input('Mobile',      sql.NVarChar(40),  norm(c.mobile, 40))
      .input('Remarks',     sql.NVarChar(255), norm(c.remarks, 255))
      .input('IsActive',    sql.Bit,           c.isActive ?? true)
      .query(`
        UPDATE dbo.CustomerContacts
           SET [Name]     = COALESCE(@Name, [Name]),
               [Position] = COALESCE(@Position, [Position]),
               EMail      = COALESCE(@EMail, EMail),
               Phone1     = COALESCE(@Phone1, Phone1),
               Phone2     = COALESCE(@Phone2, Phone2),
               Mobile     = COALESCE(@Mobile, Mobile),
               Remarks    = COALESCE(@Remarks, Remarks),
               IsActive   = COALESCE(@IsActive, IsActive),
               UpdatedAt  = SYSUTCDATETIME()
         WHERE ContactCode = @ContactCode;   -- PK global string
      `);
  } else {
    await pool.request()
      .input('CustomerId',  sql.NVarChar(50), customerId)
      .input('ContactCode', sql.NVarChar(50), code)
      .input('Name',        sql.NVarChar(100), norm(c.name, 100))
      .input('Position',    sql.NVarChar(100), norm(c.position, 100))
      .input('EMail',       sql.NVarChar(255), norm(c.eMail, 255))
      .input('Phone1',      sql.NVarChar(40),  norm(c.phone1, 40))
      .input('Phone2',      sql.NVarChar(40),  norm(c.phone2, 40))
      .input('Mobile',      sql.NVarChar(40),  norm(c.mobile, 40))
      .input('Remarks',     sql.NVarChar(255), norm(c.remarks, 255))
      .input('IsActive',    sql.Bit,           c.isActive ?? true)
      .query(`
        INSERT INTO dbo.CustomerContacts
          (CustomerId, ContactCode, [Name], [Position], EMail, Phone1, Phone2, Mobile, Remarks, IsActive, CreatedAt, UpdatedAt)
        VALUES
          (@CustomerId, @ContactCode, @Name, @Position, @EMail, @Phone1, @Phone2, @Mobile, @Remarks, @IsActive, SYSUTCDATETIME(), SYSUTCDATETIME());
      `);
  }

  return code;
}

export async function listContacts(customerId) {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .input('id', sql.VarChar(64), customerId)
    .query(`SELECT * FROM dbo.CustomerContacts WITH (NOLOCK) WHERE CustomerId=@id;`);
  return recordset;
}

export async function removeContact(customerId, contactCode) {
  const pool = await getPool();
  const { rowsAffected } = await pool.request()
    .input('id', sql.VarChar(64), customerId)
    .input('code', sql.Int, contactCode)
    .query(`DELETE FROM dbo.CustomerContacts WHERE CustomerId=@id AND ContactCode=@code;`);
  return rowsAffected[0] > 0;
}

export async function createMany(customerId, items, onConflict = 'error') {
  const pool = await getPool();

  // 0) Verifica que el cliente exista y no esté eliminado
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
  const norm = (v, m) => (v == null ? null : String(v).trim().slice(0, m));

  try {
    for (let i = 0; i < items.length; i++) {
      const c = items[i];

      // defensa extra: contactCode obligatorio
      const code = norm(c.contactCode, 50);
      if (!code) {
        await tx.rollback();
        return {
          status: 400,
          payload: { error: 'CONTACT_CODE_REQUIRED', details: `Falta contactCode en item #${i + 1}` }
        };
      }

      // build request de INSERT
      const reqIns = new sql.Request(tx)
        .input('CustomerId',  sql.NVarChar(50),  customerId)
        .input('ContactCode', sql.NVarChar(50),  code)
        .input('Name',        sql.NVarChar(100), norm(c.name, 100))
        .input('Position',    sql.NVarChar(100), norm(c.position, 100))
        .input('EMail',       sql.NVarChar(255), norm(c.eMail, 255))
        .input('Phone1',      sql.NVarChar(40),  norm(c.phone1, 40))
        .input('Phone2',      sql.NVarChar(40),  norm(c.phone2, 40))
        .input('Mobile',      sql.NVarChar(40),  norm(c.mobile, 40))
        .input('Remarks',     sql.NVarChar(255), norm(c.remarks, 255))
        .input('IsActive',    sql.Bit,           c.isActive ?? true);

      try {
        await reqIns.query(`
          INSERT INTO dbo.CustomerContacts
            (CustomerId, ContactCode, [Name], [Position], EMail, Phone1, Phone2, Mobile, Remarks, IsActive, CreatedAt, UpdatedAt)
          VALUES
            (@CustomerId, @ContactCode, @Name, @Position, @EMail, @Phone1, @Phone2, @Mobile, @Remarks, @IsActive, SYSUTCDATETIME(), SYSUTCDATETIME());
        `);
        created.push(code);
      } catch (e) {
        const errNum = e?.number || e?.originalError?.info?.number;

        // 2627/2601 = PK/UNIQUE violation (ContactCode ya existe)
        if (errNum === 2627 || errNum === 2601) {
          // ¿El código pertenece a otro cliente?
          const ownerRS = await new sql.Request(tx)
            .input('ContactCode', sql.NVarChar(50), code)
            .query(`SELECT CustomerId FROM dbo.CustomerContacts WITH (UPDLOCK, HOLDLOCK) WHERE ContactCode=@ContactCode;`);
          const ownerId = ownerRS.recordset[0]?.CustomerId;

          if (ownerId && ownerId !== customerId) {
            await tx.rollback();
            return {
              status: 409,
              payload: {
                error: 'CONTACT_CODE_TAKEN',
                details: `ContactCode pertenece a otro cliente: ${ownerId}`,
                contactCode: code,
                ownerId
              }
            };
          }

          if (onConflict === 'ignore') {
            skipped.push(code);
            continue;
          }

          if (onConflict === 'replace') {
            await new sql.Request(tx)
              .input('CustomerId',  sql.NVarChar(50),  customerId)
              .input('ContactCode', sql.NVarChar(50),  code)
              .input('Name',        sql.NVarChar(100), norm(c.name, 100))
              .input('Position',    sql.NVarChar(100), norm(c.position, 100))
              .input('EMail',       sql.NVarChar(255), norm(c.eMail, 255))
              .input('Phone1',      sql.NVarChar(40),  norm(c.phone1, 40))
              .input('Phone2',      sql.NVarChar(40),  norm(c.phone2, 40))
              .input('Mobile',      sql.NVarChar(40),  norm(c.mobile, 40))
              .input('Remarks',     sql.NVarChar(255), norm(c.remarks, 255))
              .input('IsActive',    sql.Bit,           c.isActive ?? true)
              .query(`
                UPDATE dbo.CustomerContacts
                   SET [Name]     = COALESCE(@Name, [Name]),
                       [Position] = COALESCE(@Position, [Position]),
                       EMail      = COALESCE(@EMail, EMail),
                       Phone1     = COALESCE(@Phone1, Phone1),
                       Phone2     = COALESCE(@Phone2, Phone2),
                       Mobile     = COALESCE(@Mobile, Mobile),
                       Remarks    = COALESCE(@Remarks, Remarks),
                       IsActive   = COALESCE(@IsActive, IsActive),
                       UpdatedAt  = SYSUTCDATETIME()
                 WHERE ContactCode=@ContactCode;   -- PK global
              `);
            updated.push(code);
            continue;
          }

          // onConflict = error (default)
          await tx.rollback();
          return {
            status: 409,
            payload: { error: 'CONTACT_EXISTS', details: `ContactCode ya existe: ${code}` }
          };
        }

        // Otro error SQL
        throw e;
      }
    }

    await tx.commit();
    const status = (updated.length || skipped.length) ? 207 : 201;
    return { status, payload: { created, updated, skipped } };
  } catch (err) {
    try { await tx.rollback(); } catch {}
    console.error('[contacts.createMany]', err);
    return { status: 500, payload: { error: 'INTERNAL_ERROR' } };
  }
}

export async function getContactByCode(customerId, contactCode) {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .input('CustomerId',  sql.NVarChar(50), customerId)
    .input('ContactCode', sql.NVarChar(50), contactCode)
    .query(`
      SELECT CustomerId, ContactCode, [Name], [Position], EMail, Phone1, Phone2, Mobile,
             Remarks, IsActive, CreatedAt, UpdatedAt
      FROM dbo.CustomerContacts WITH (NOLOCK)
      WHERE CustomerId = @CustomerId AND ContactCode = @ContactCode;
    `);
  return recordset[0] || null;
}