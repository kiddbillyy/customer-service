const { body, param } = require("express-validator");

exports.auditBundleValidator = [
  param("bundleID").isInt().withMessage("bundleID debe ser un entero"),
  body("auditStatusID")
    .exists().withMessage("auditStatusID es requerido")
    .isInt().withMessage("auditStatusID debe ser un entero"),
  body("comments")
    .optional()
    .isString().withMessage("comments debe ser un texto"),
  body("auditorRUT")
    .exists().withMessage("auditorRUT es requerido")
    .isString().withMessage("auditorRUT debe ser un texto"),
];
