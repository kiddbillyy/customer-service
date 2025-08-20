// src/validations/pickingValidator.js
const { check, body, param } = require('express-validator');

exports.assignPickersValidator = [
  check('orderID')
    .exists().withMessage('orderID es requerido')
    .isInt().withMessage('orderID debe ser un número'),
  check('pickerAssignments')
    .exists().withMessage('pickerAssignments es requerido')
    .isArray().withMessage('pickerAssignments debe ser un arreglo'),
  check('pickerAssignments.*.orderProductID')
    .exists().withMessage('orderProductID es requerido para cada asignación')
    .isInt().withMessage('orderProductID debe ser numérico'),
  check('pickerAssignments.*.pickerRUT')
    .exists().withMessage('pickerRUT es requerido para cada asignación')
    .isInt().withMessage('pickerRUT debe ser una cadena'),
];
exports.finalizePickingValidator = [
  check("orderID")
    .exists().withMessage("orderID es requerido")
    .isInt().withMessage("orderID debe ser un número"),
  body("reassignments")
    .optional()
    .isArray().withMessage("reassignments debe ser un arreglo"),
  body("reassignments.*.orderProductID")
    .exists().withMessage("orderProductID es requerido en cada reasignación")
    .isInt().withMessage("orderProductID debe ser numérico"),
  body("reassignments.*.oldPicker")
    .exists().withMessage("oldPicker es requerido en cada reasignación")
    .isInt().withMessage("oldPicker debe ser numérico"),
  body("reassignments.*.newPicker")
    .exists().withMessage("newPicker es requerido en cada reasignación")
    .isInt().withMessage("newPicker debe ser numérico"),
  body("reassignments.*.reason")
    .exists().withMessage("reason es requerido en cada reasignación")
    .isString().withMessage("reason debe ser una cadena"),
];

exports.reassignPickerValidator = [
  check('newPicker')
    .exists().withMessage('newPicker es requerido')
    .isInt().withMessage('newPicker debe ser numérico'),
  check('quantity')
    .exists().withMessage('quantity es requerido')
    .isInt({ gt: 0 }).withMessage('quantity debe ser mayor a 0'),
  check('reason')
    .exists().withMessage('reason es requerido')
    .isString().withMessage('reason debe ser una cadena'),
];

exports.updatePickedProductValidator = [
  param('orderProductID')
    .exists().withMessage('orderProductID es requerido')
    .isInt().withMessage('orderProductID debe ser un número'),
  check('pickedQuantity')
    .exists().withMessage('pickedQuantity es requerido')
    .isInt({ gt: 0 }).withMessage('pickedQuantity debe ser mayor que 0'),
];
exports.completePickingValidator = [
  check('orderID')
    .exists().withMessage('orderID es requerido')
    .isInt().withMessage('orderID debe ser un número'),
];

exports.getProductsFromOrderValidator = [
  check('orderID')
    .exists().withMessage('orderID es requerido')
    .isInt().withMessage('orderID debe ser un número'),
];
