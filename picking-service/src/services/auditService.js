const AuditRepository = require('../models/auditRepository');
const { sendMessage } = require('../producer');

const AuditService = {
  auditBundle: async (bundleID, auditStatusID, comments, auditorRUT) => {
    const result = await AuditRepository.auditBundle(bundleID, auditStatusID, comments, auditorRUT);
    if (result) {
      await sendMessage('bundle.audited', { bundleID, auditStatusID, comments, auditorRUT });
    }
    return result;
  }
};

module.exports = AuditService;
