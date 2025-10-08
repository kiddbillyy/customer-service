// utils/rut.js
function toRutPlain(input) {
  if (!input) return null;
  return String(input).trim().toUpperCase().replace(/[^0-9K]/g, ''); // solo dígitos y K
}
module.exports = { toRutPlain };
