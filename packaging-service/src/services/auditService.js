const AuditRepository = require("../models/auditRepository");
const { sendMessage } = require("../producer");

const AuditService = {
  auditBundle: async (bundleID, auditStatusID, comments, auditorRUT) => {
    // Actualiza el estado de auditoría en la DB
    const result = await AuditRepository.auditBundle(bundleID, auditStatusID, comments, auditorRUT);
    if (result) {
      // Si se auditó correctamente, notifica por Kafka
      await sendMessage("bundle.audited", {
        bundleID,
        auditStatusID,
        comments,
        auditorRUT
      });

    }
    return result;
  }
};

module.exports = AuditService;
