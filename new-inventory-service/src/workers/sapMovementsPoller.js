// src/workers/sapMovementsPoller.js
const { getPool } = require('../config/db');       // BD local
const { getSapPool } = require('../config/sapDb'); // BD SAP remota
const sql = require('mssql');

const BATCH = Number(process.env.SAP_MOV_POLL_BATCH || 500);

// --- mapeo de tipos desde SAP ---
function mapSapMovimientoToType(m) {
  const v = String(m || '').trim().toLowerCase();
  if (v.startsWith('entrad') || v === 'em' || v === 'ingreso') return 'EM';
  if (v.startsWith('salid')  || v === 'sm' || v === 'egreso')  return 'SM';
  if (v.includes('transfer')) return 'TT';
  if (v.startsWith('reser'))  return 'FR';
  if (v === 'noventa' || v.includes('liber')) return 'NV';
  if (v === 'ep') return 'EP';
  if (v === 'poadd') return 'POADD';
  if (v === 'porem') return 'POREM';
  return null; // no soportado
}

function buildSpArgsFromRow(row) {
  const type = mapSapMovimientoToType(row.Movimiento);
  if (!type) return null;

  let fromWh = null, toWh = null;
  switch (type) {
    case 'SM': fromWh = row.WhsCode; break;
    case 'EM': toWh   = row.WhsCode; break;
    case 'TT':
      fromWh = row.FromWhsCode || row.WhsCodeFrom || row.WhsCode;
      toWh   = row.ToWhsCode   || row.WhsCodeTo;
      break;
    case 'FR': fromWh = row.WhsCode; break;
    case 'NV': fromWh = row.WhsCode; break;
    case 'EP': toWh   = row.WhsCode; break;
    case 'POADD': toWh = row.WhsCode; break;
    case 'POREM': toWh = row.WhsCode; break;
  }

  const reference = `SAP:${row.ObjectType || ''}/${row.DocEntry || ''}#${row.ID}`;
  const meta = {
    sapId: row.ID,
    docEntry: row.DocEntry,
    objectType: row.ObjectType,
    user: row.Usuario,
    estado: row.Estado,
    fechaMov: row.FechaMov,
    intentos: row.Intentos,
    error: row.Error
  };

  return {
    type,
    itemSku: row.ItemCode,
    fromWhCode: fromWh || null,
    toWhCode: toWh || null,
    quantity: Number(row.Quantity || 0),
    reference,
    metaJson: JSON.stringify(meta)
  };
}

async function applyMovementViaSP(localPool, args) {
  const r = await localPool.request()
    .input('type',       sql.NVarChar(20),  args.type)
    .input('itemSku',    sql.NVarChar(100), args.itemSku)
    .input('fromWhCode', sql.NVarChar(40),  args.fromWhCode)
    .input('toWhCode',   sql.NVarChar(40),  args.toWhCode)
    .input('quantity',   sql.Decimal(18,3), args.quantity)
    .input('reference',  sql.NVarChar(200), args.reference)
    .input('metaJson',   sql.NVarChar(sql.MAX), args.metaJson)
    .execute('dbo.apply_movement'); // SP devuelve movementId, type
  return r.recordset?.[0];
}

async function ensureCursorRow(localPool) {
  const sourceDb = process.env.SAP_COMPANY_DB || 'COMERCIAL_CIERRE_TEST';
  await localPool.request()
    .input('sourceDb', sourceDb)
    .input('tableName', 'Z_MovStockOMS')
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.SapMovementsCursor WHERE sourceDb=@sourceDb AND tableName=@tableName
      )
      INSERT INTO dbo.SapMovementsCursor (sourceDb, tableName, lastId, lastRunAt)
      VALUES (@sourceDb, @tableName, 0, GETDATE());
    `);
}

async function getLastCursor(localPool) {
  const sourceDb = process.env.SAP_COMPANY_DB || 'COMERCIAL_CIERRE_TEST';
  const rs = await localPool.request()
    .input('sourceDb', sourceDb)
    .input('tableName', 'Z_MovStockOMS')
    .query(`
      SELECT TOP 1 * FROM dbo.SapMovementsCursor
      WHERE sourceDb=@sourceDb AND tableName=@tableName
    `);
  return rs.recordset[0] || null;
}

async function updateCursor(localPool, lastId) {
  const sourceDb = process.env.SAP_COMPANY_DB || 'COMERCIAL_CIERRE_TEST';
  await localPool.request()
    .input('sourceDb', sourceDb)
    .input('tableName', 'Z_MovStockOMS')
    .input('lastId', lastId)
    .query(`
      UPDATE dbo.SapMovementsCursor
      SET lastId = @lastId, lastRunAt = GETDATE()
      WHERE sourceDb=@sourceDb AND tableName=@tableName
    `);
}

async function fetchBatchFromSap(sapPool, lastId) {
  const q = `
    SELECT TOP (${BATCH})
      ID, DocEntry, ObjectType, ItemCode, Quantity, Movimiento, FechaMov,
      WhsCode, FromWhsCode, Usuario, Estado, Intentos, [Error]
    FROM dbo.Z_MovStockOMS WITH (NOLOCK)
    WHERE ID > @lastId
    ORDER BY ID ASC;
  `;
  const rs = await sapPool.request().input('lastId', lastId).query(q);
  return rs.recordset;
}

// ======= FALTA EN TU ARCHIVO: esta función =======
async function pollSapMovementsOnce() {
  const localPool = await getPool();
  const sapPool   = await getSapPool();

  await ensureCursorRow(localPool);

  const cursor = await getLastCursor(localPool);
  const lastId = cursor?.lastId || 0;

  const rows = await fetchBatchFromSap(sapPool, lastId);
  if (rows.length === 0) {
    console.log(`[SAP-MOV] sin nuevos registros desde ID=${lastId}`);
    await updateCursor(localPool, lastId); // refresca lastRunAt
    return { processed: 0, ok: 0, skipped: 0, fail: 0, lastId };
  }

  let maxId = lastId, ok = 0, fail = 0, skipped = 0;

  for (const row of rows) {
    try {
      const args = buildSpArgsFromRow(row);
      if (!args) { skipped++; continue; }
      if (args.quantity <= 0) { skipped++; continue; }

      const res = await applyMovementViaSP(localPool, args);
      // res: { movementId, type }
      ok++;
      if (row.ID > maxId) maxId = row.ID;
    } catch (e) {
      fail++;
      if (row.ID > maxId) maxId = row.ID;
      console.error(`❌ [SAP-MOV] ID=${row.ID} error:`, e.message || e);
    }
  }

  await updateCursor(localPool, maxId);
  console.log(`[SAP-MOV] batch=${rows.length} ok=${ok} skipped=${skipped} fail=${fail} lastId=${maxId}`);
  return { processed: rows.length, ok, skipped, fail, lastId: maxId };
}
// ================================================

module.exports = { pollSapMovementsOnce };
