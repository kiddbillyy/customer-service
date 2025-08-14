// utils/dates.js
const { DateTime } = require('luxon');

// Si ya tienes nowSCL() que devuelve Date, lo dejamos.
// Agregamos una versión para SQL (estilo 121: yyyy-mm-dd hh:mi:ss.mmm)
function nowSCLSql121() {
  return DateTime.now()
    .setZone('America/Santiago')
    .toFormat('yyyy-LL-dd HH:mm:ss.SSS'); // compatible con CONVERT(..., 121)
}

module.exports = { nowSCLSql121 };
