const AuditService = require("../services/auditService");

exports.auditBundle = async (req, res) => {
  try {
    const { bundleID } = req.params;
    const { auditStatusID, comments, auditorRUT } = req.body;

    const result = await AuditService.auditBundle(bundleID, auditStatusID, comments, auditorRUT);
    if (!result) {
      return res.status(404).json({ message: "Bulto no encontrado o auditoría fallida" });
    }
    res.json({ message: "Bulto auditado correctamente", result });
  } catch (error) {
    console.error("❌ Error en auditoría:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
