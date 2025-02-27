const { body, param } = require('express-validator');

exports.auditBundleValidator = [
  param('bundleID').isInt().withMessage('bundleID debe ser un entero'),
  body('auditStatus')
    .isIn(['approved', 'rejected'])
    .withMessage('auditStatus debe ser "approved" o "rejected"'),
  body('comments')
    .optional()
    .isString()
    .withMessage('comments debe ser un texto')
];
