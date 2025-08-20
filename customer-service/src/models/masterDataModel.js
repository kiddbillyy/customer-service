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