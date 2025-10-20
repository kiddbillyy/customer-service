const { getPool, sql } = require('./sql');
const q   = require('./queries');
const cfg = require('./config');
const { publishPOCancelled, publishPaymentReceived } = require('./kafka'); // 👈 agrega este export
const log = require('./logger');

async function processOnce() {
  const pool = await getPool();

  const claim = await pool.request().query(q.claimPendingBatch(cfg.worker.batchSize));
  const rows  = claim.recordset || [];
  if (rows.length === 0) {
    await pool.request().query(q.requeueSome(cfg.worker.requeueTop, cfg.worker.maxRetry));
    return;
  }

  for (const r of rows) {
    const id = r.OutboxId;
    const de = r.DocEntry;
    const et = r.EventType; // 👈 ahora usamos el tipo de evento

    try {
      if (et === 'PurchaseOrder.Cancelled') {
        // Sanity check post-commit
        const chk = await pool.request().input('docEntry', sql.Int, de).query(q.checkOPORCancelled);
        const cancelled = chk.recordset?.[0]?.CANCELED === 'Y';
        if (!cancelled) {
          await pool.request().input('id', sql.BigInt, id).query(q.markDeferred);
          continue;
        }

        await publishPOCancelled({ key: String(de), payload: r.PayloadJson });
        await pool.request().input('id', sql.BigInt, id).query(q.markSent);
        log.info({ id, de, et }, 'sent');

      } else if (et === 'Payment.Received') {
        // Sanity check: el pago debe existir (ya commit en SAP)
        const chk = await pool.request().input('docEntry', sql.Int, de).query(q.checkPaymentExists);
        if (!chk.recordset?.length) {
          await pool.request().input('id', sql.BigInt, id).query(q.markDeferred);
          continue;
        }

        await publishPaymentReceived({ key: String(de), payload: r.PayloadJson });
        await pool.request().input('id', sql.BigInt, id).query(q.markSent);
        log.info({ id, de, et }, 'sent');

      } else {
        // Tipo no mapeado
        await pool.request()
          .input('id',  sql.BigInt, id)
          .input('msg', sql.NVarChar(1000), `No topic mapping for ${et}`)
          .query(q.markError);
      }

    } catch (e) {
      await pool.request()
        .input('id',  sql.BigInt, id)
        .input('msg', sql.NVarChar(1000), e?.message || String(e))
        .query(q.markError);
      log.error({ id, de, et, err: e?.message }, 'error');
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function runLoop(signal) { while (!signal.stop) { await processOnce().catch(()=>{}); await sleep(cfg.worker.pollMs); } }

module.exports = { runLoop };
