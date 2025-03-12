const pool = require("../config/db");

const AuditRepository = {
  auditBundle: async (bundleID, auditStatusID, comments, auditorRUT) => {
    const [result] = await pool.query(
      `UPDATE Bundles
       SET auditStatusID = ?, auditComments = ?, auditedAt = NOW(), auditRUT = ?
       WHERE bundleID = ?`,
      [auditStatusID, comments, auditorRUT, bundleID]
    );
    return result.affectedRows > 0;
  }
};

module.exports = AuditRepository;
