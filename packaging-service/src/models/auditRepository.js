const pool = require("../config/db");

const AuditRepository = {
  auditBundle: async (bundleID, auditStatusID, comments, auditorRUT) => {
    const [result] = await pool.query(
      `UPDATE packaging_service_db.bundles
       SET auditStatusID = ?, auditComments = ?, auditedAt = GETDATE(), auditRUT = ?
       WHERE bundleID = ?`,
      [auditStatusID, comments, auditorRUT, bundleID]
    );
    return result.rowsAffected[0] > 0;
  }
};

module.exports = AuditRepository;
