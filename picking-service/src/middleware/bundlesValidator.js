const { check } = require('express-validator');

exports.createBundleValidator = [
  check('orderID')
    .exists().withMessage('orderID es requerido')
    .isInt().withMessage('orderID debe ser un número'),
  check('pickerRUT')
    .exists().withMessage('pickerRUT es requerido')
    .isString().withMessage('pickerRUT debe ser una cadena'),
  check('packageTypeID')
    .exists().withMessage('packageTypeID es requerido')
    .isInt().withMessage('packageTypeID debe ser un número'),
  check('products')
    .exists().withMessage('products es requerido')
    .isArray().withMessage('products debe ser un arreglo'),
  check('products.*.orderProductID')
    .exists().withMessage('orderProductID es requerido para cada producto')
    .isInt().withMessage('orderProductID debe ser numérico'),
  check('products.*.quantity')
    .exists().withMessage('quantity es requerido para cada producto')
    .isInt({ gt: 0 }).withMessage('quantity debe ser mayor que 0'),
];

exports.getBundleDetailsValidator = [
  check('bundleID')
    .exists().withMessage('bundleID es requerido')
    .isInt().withMessage('bundleID debe ser un número'),
];

exports.getBundlesByOrderValidator = [
  check('orderID')
    .exists().withMessage('orderID es requerido')
    .isInt().withMessage('orderID debe ser un número'),
];

exports.getOrderProductsWithBundleIDValidator = [
  check('orderID')
    .exists().withMessage('orderID es requerido')
    .isInt().withMessage('orderID debe ser un número'),
];

exports.updateBundleDimensionsValidator = [
  check('height')
    .exists().withMessage('height es requerido')
    .isFloat({ gt: 0 }).withMessage('height debe ser un número mayor que 0'),
  check('width')
    .exists().withMessage('width es requerido')
    .isFloat({ gt: 0 }).withMessage('width debe ser un número mayor que 0'),
  check('length')
    .exists().withMessage('length es requerido')
    .isFloat({ gt: 0 }).withMessage('length debe ser un número mayor que 0'),
  check('weight')
    .exists().withMessage('weight es requerido')
    .isFloat({ gt: 0 }).withMessage('weight debe ser un número mayor que 0'),
  check('location')
    .optional()
    .isString().withMessage('location debe ser una cadena'),
];
