// src/validations/pickingValidator.js
const { check } = require('express-validator');

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

exports.updatePickedProductValidator = [
  check('orderProductID')
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
