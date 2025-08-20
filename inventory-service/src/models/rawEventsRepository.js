const { query } = require('../config/db');
const MAX_ATTEMPTS = 100;

const RawRepo = {
  /* Inserta si no existe (idempotente por source + natural_key) */
  async insertIfNew ({ source, eventType, naturalKey, payload }) {
  await query(`
    IF NOT EXISTS (
      SELECT 1 FROM inventory_service_db.dbo.raw_events
       WHERE source = ? AND natural_key = ?
    )
    INSERT INTO inventory_service_db.dbo.raw_events
        (source, event_type, natural_key, payload)
    VALUES (?, ?, ?, ?);
  `, [
    source,                // para el NOT EXISTS
    naturalKey,            //
    source, eventType, naturalKey,
    JSON.stringify(payload)
  ]);
},

  async getPending (batch = 200) {
    const [rows] = await query(`
      SELECT TOP (${batch}) *
        FROM inventory_service_db.dbo.raw_events WITH (ROWLOCK, READPAST)
       WHERE status IN ('pending','error')
         AND attempts < ${MAX_ATTEMPTS}
       ORDER BY received_at;
    `);
    return rows;
  },

  async markDone (id) {
    await query(`UPDATE inventory_service_db.dbo.raw_events
                    SET status='done', attempts = attempts+1
                  WHERE id = ?;`, [id]);
  },

  async markError (id, msg) {
    await query(`
      UPDATE inventory_service_db.dbo.raw_events
         SET status   = CASE WHEN attempts+1 >= ${MAX_ATTEMPTS} THEN 'dead' ELSE 'error' END,
             attempts = attempts+1,
             last_error = ?
       WHERE id = ?;`, [msg.slice(0,1024), id]);
  }
};

module.exports = RawRepo;
