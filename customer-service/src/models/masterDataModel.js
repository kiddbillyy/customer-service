import { getPool, sql } from '../config/db.js';

export async function listPaymentTerms() {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .query(`SELECT * FROM dbo.PaymentTerms WITH (NOLOCK) WHERE IsActive=1;`);
  return recordset;
}

export async function listPriceLists() {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .query(`SELECT * FROM dbo.PriceLists WITH (NOLOCK) WHERE IsActive=1;`);
  return recordset;
}

export async function listCustomerGroups(partnerType) {
  const pool = await getPool();
  const req = pool.request();
  let sqlTxt = `SELECT * FROM dbo.CustomerGroups WITH (NOLOCK) WHERE IsActive=1`;
  if (partnerType) {
    req.input('pt', sql.Char(1), partnerType);
    sqlTxt += ` AND PartnerType=@pt`;
  }
  const { recordset } = await req.query(sqlTxt);
  return recordset;
}

export async function createPaymentTerms(items, onConflict /* 'error'|'ignore'|'replace' */) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  const created = [];
  const updated = [];
  const skipped = [];

  try {
    for (const it of items) {
      const norm = (v, max) => v == null ? null : String(v).trim().slice(0, max);

      const reqIns = new sql.Request(tx)
        .input('GroupNum', sql.Int, it.groupNum)
        .input('PymntGroup', sql.NVarChar(100), norm(it.pymntGroup, 100))
        .input('ExtraDays', sql.Int, it.extraDays ?? 0)
        .input('Installments', sql.Int, it.installments ?? null)
        .input('IsActive', sql.Bit, it.isActive ?? true);

      try {
        await reqIns.query(`
          INSERT INTO dbo.PaymentTerms
            (GroupNum, PymntGroup, ExtraDays, Installments, IsActive, CreatedAt, UpdatedAt)
          VALUES
            (@GroupNum, @PymntGroup, @ExtraDays, @Installments, @IsActive, SYSUTCDATETIME(), SYSUTCDATETIME());
        `);
        created.push(it.groupNum);
      } catch (e) {
        const code = e?.number || e?.originalError?.info?.number;
        if (code === 2627 || code === 2601) {
          // PK/UNIQUE conflict (probable PK GroupNum)
          if (onConflict === 'ignore') {
            skipped.push(it.groupNum);
            continue;
          }
          if (onConflict === 'replace') {
            await new sql.Request(tx)
              .input('GroupNum', sql.Int, it.groupNum)
              .input('PymntGroup', sql.NVarChar(100), norm(it.pymntGroup, 100))
              .input('ExtraDays', sql.Int, it.extraDays ?? 0)
              .input('Installments', sql.Int, it.installments ?? null)
              .input('IsActive', sql.Bit, it.isActive ?? true)
              .query(`
                UPDATE dbo.PaymentTerms
                SET PymntGroup=@PymntGroup,
                    ExtraDays=@ExtraDays,
                    Installments=@Installments,
                    IsActive=@IsActive,
                    UpdatedAt=SYSUTCDATETIME()
                WHERE GroupNum=@GroupNum;
              `);
            updated.push(it.groupNum);
            continue;
          }
          // error
          await tx.rollback();
          return {
            status: 409,
            payload: { error: 'PAYMENT_TERM_EXISTS', details: `GroupNum ya existe: ${it.groupNum}` }
          };
        }
        throw e;
      }
    }

    await tx.commit();
    const payload = { created, updated, skipped };
    const status = (updated.length || skipped.length) ? 207 : 201;
    return { status, payload };
  } catch (err) {
    try { await tx.rollback(); } catch {}
    // log opcional
    // console.error('[createPaymentTerms] error:', err);
    return { status: 500, payload: { error: 'INTERNAL_ERROR' } };
  }
}

export async function createCustomerGroups(items, onConflict /* 'error'|'ignore'|'replace' */) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  const created = [];
  const updated = [];
  const skipped = [];

  try {
    for (const it of items) {
      const norm = (v, max) => v == null ? null : String(v).trim().slice(0, max);

      const reqIns = new sql.Request(tx)
        .input('GroupCode', sql.Int, it.groupCode)
        .input('GroupName', sql.NVarChar(100), norm(it.groupName, 100))
        .input('PartnerType', sql.NVarChar(1), String(it.partnerType).toUpperCase())
        .input('IsActive', sql.Bit, it.isActive ?? true);

      try {
        await reqIns.query(`
          INSERT INTO dbo.CustomerGroups
            (GroupCode, GroupName, PartnerType, IsActive, CreatedAt, UpdatedAt)
          VALUES
            (@GroupCode, @GroupName, @PartnerType, @IsActive, SYSUTCDATETIME(), SYSUTCDATETIME());
        `);
        created.push(it.groupCode);
      } catch (e) {
        const code = e?.number || e?.originalError?.info?.number;
        // Conflicto PK/UNIQUE (ej. PK GroupCode)
        if (code === 2627 || code === 2601) {
          if (onConflict === 'ignore') {
            skipped.push(it.groupCode);
            continue;
          }
          if (onConflict === 'replace') {
            await new sql.Request(tx)
              .input('GroupCode', sql.Int, it.groupCode)
              .input('GroupName', sql.NVarChar(100), norm(it.groupName, 100))
              .input('PartnerType', sql.NVarChar(1), String(it.partnerType).toUpperCase())
              .input('IsActive', sql.Bit, it.isActive ?? true)
              .query(`
                UPDATE dbo.CustomerGroups
                SET GroupName=@GroupName,
                    PartnerType=@PartnerType,
                    IsActive=@IsActive,
                    UpdatedAt=SYSUTCDATETIME()
                WHERE GroupCode=@GroupCode;
              `);
            updated.push(it.groupCode);
            continue;
          }
          await tx.rollback();
          return {
            status: 409,
            payload: { error: 'CUSTOMER_GROUP_EXISTS', details: `GroupCode ya existe: ${it.groupCode}` }
          };
        }
        throw e;
      }
    }

    await tx.commit();
    const payload = { created, updated, skipped };
    const status = (updated.length || skipped.length) ? 207 : 201;
    return { status, payload };
  } catch (err) {
    try { await tx.rollback(); } catch {}
    // console.error('[createCustomerGroups] error:', err);
    return { status: 500, payload: { error: 'INTERNAL_ERROR' } };
  }
}

export async function updatePaymentTerm(groupNum, patch) {
  const pool = await getPool();
  const r = pool.request()
    .input('GroupNum', sql.Int, groupNum)
    .input('UpdatedAt', sql.DateTime2(3), new Date());
  const sets = [];

  const map = {
    pymntGroup: ['PymntGroup', sql.NVarChar(100)],
    extraDays: ['ExtraDays', sql.Int],
    installments: ['Installments', sql.Int],
    isActive: ['IsActive', sql.Bit]
  };
  for (const [k, [col, typ]] of Object.entries(map)) {
    if (k in patch) { sets.push(`${col}=@${col}`); r.input(col, typ, patch[k]); }
  }
  if (!sets.length) {
    const { recordset } = await pool.request().input('GroupNum', sql.Int, groupNum)
      .query(`SELECT * FROM dbo.PaymentTerms WITH (NOLOCK) WHERE GroupNum=@GroupNum;`);
    return recordset[0] || null;
  }

  const { rowsAffected } = await r.query(`
    UPDATE dbo.PaymentTerms
       SET ${sets.join(', ')}, UpdatedAt=@UpdatedAt
     WHERE GroupNum=@GroupNum;
  `);
  if (!rowsAffected[0]) return null;

  const { recordset } = await pool.request().input('GroupNum', sql.Int, groupNum)
    .query(`SELECT * FROM dbo.PaymentTerms WITH (NOLOCK) WHERE GroupNum=@GroupNum;`);
  return recordset[0] || null;
}

export async function deletePaymentTerm(groupNum, hard = false) {
  const pool = await getPool();

  if (hard) {
    try {
      const { rowsAffected } = await pool.request()
        .input('GroupNum', sql.Int, groupNum)
        .query(`DELETE FROM dbo.PaymentTerms WHERE GroupNum=@GroupNum;`);
      if (rowsAffected[0]) return { ok: true, hardDeleted: true, softDeactivated: false };
      return { ok: false };
    } catch (e) {
      // FK (547) => cae a soft delete
      const code = e?.number || e?.originalError?.info?.number;
      if (code !== 547) throw e;
    }
  }

  const { rowsAffected } = await pool.request()
    .input('GroupNum', sql.Int, groupNum)
    .query(`
      UPDATE dbo.PaymentTerms
         SET IsActive = 0, UpdatedAt = SYSUTCDATETIME()
       WHERE GroupNum=@GroupNum;
    `);
  return rowsAffected[0]
    ? { ok: true, hardDeleted: false, softDeactivated: true }
    : { ok: false };
}

/* ===== Customer Groups ===== */
export async function updateCustomerGroup(groupCode, patch) {
  const pool = await getPool();
  const r = pool.request()
    .input('GroupCode', sql.Int, groupCode)
    .input('UpdatedAt', sql.DateTime2(3), new Date());
  const sets = [];

  const map = {
    groupName: ['GroupName', sql.NVarChar(100)],
    partnerType: ['PartnerType', sql.Char(1)],
    isActive: ['IsActive', sql.Bit]
  };
  for (const [k, [col, typ]] of Object.entries(map)) {
    if (k in patch) { sets.push(`${col}=@${col}`); r.input(col, typ, patch[k]); }
  }
  if (!sets.length) {
    const { recordset } = await pool.request().input('GroupCode', sql.Int, groupCode)
      .query(`SELECT * FROM dbo.CustomerGroups WITH (NOLOCK) WHERE GroupCode=@GroupCode;`);
    return recordset[0] || null;
  }

  try {
    const { rowsAffected } = await r.query(`
      UPDATE dbo.CustomerGroups
         SET ${sets.join(', ')}, UpdatedAt=@UpdatedAt
       WHERE GroupCode=@GroupCode;
    `);
    if (!rowsAffected[0]) return null;
  } catch (e) {
    const code = e?.number || e?.originalError?.info?.number;
    if (code === 2627 || code === 2601) {
      // por si tienes un índice único por (PartnerType, GroupName)
      return { error: 'DUPLICATE_KEY', http: 409, details: 'Nombre ya existe para ese tipo' };
    }
    throw e;
  }

  const { recordset } = await pool.request().input('GroupCode', sql.Int, groupCode)
    .query(`SELECT * FROM dbo.CustomerGroups WITH (NOLOCK) WHERE GroupCode=@GroupCode;`);
  return recordset[0] || null;
}

export async function deleteCustomerGroup(groupCode, hard = false) {
  const pool = await getPool();

  if (hard) {
    try {
      const { rowsAffected } = await pool.request()
        .input('GroupCode', sql.Int, groupCode)
        .query(`DELETE FROM dbo.CustomerGroups WHERE GroupCode=@GroupCode;`);
      if (rowsAffected[0]) return { ok: true, hardDeleted: true, softDeactivated: false };
      return { ok: false };
    } catch (e) {
      const code = e?.number || e?.originalError?.info?.number;
      if (code !== 547) throw e; // otras excepciones
    }
  }

  const { rowsAffected } = await pool.request()
    .input('GroupCode', sql.Int, groupCode)
    .query(`
      UPDATE dbo.CustomerGroups
         SET IsActive = 0, UpdatedAt = SYSUTCDATETIME()
       WHERE GroupCode=@GroupCode;
    `);

  return rowsAffected[0]
    ? { ok: true, hardDeleted: false, softDeactivated: true }
    : { ok: false };
}

export async function upsertPriceListFromSap({ listNum, listName, createDate }) {
  const pool = await getPool();

  await pool.request()
    .input('ListNum',  sql.Int, listNum)
    .input('ListName', sql.NVarChar(100), listName)
    .input('CreateDate', sql.DateTime2(3), createDate ?? null)
    .query(`
      MERGE dbo.PriceLists AS t
      USING (SELECT @ListNum AS ListNum) AS s
        ON t.ListNum = s.ListNum
      WHEN MATCHED THEN UPDATE SET
        ListName = @ListName,
        IsActive = 1,
        UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT
        (ListNum, ListName, IsActive, CreatedAt, UpdatedAt)
      VALUES
        (@ListNum, @ListName, 1, COALESCE(@CreateDate, SYSUTCDATETIME()), SYSUTCDATETIME());
    `);

  const { recordset } = await pool.request()
    .input('ListNum', sql.Int, listNum)
    .query(`SELECT * FROM dbo.PriceLists WITH (NOLOCK) WHERE ListNum=@ListNum;`);

  return recordset[0] || null;
}