// utils/dates.js
const { DateTime } = require('luxon');

function nowSCLIso() {
  // ISO con zona America/Santiago, incluye milisegundos y offset
  return DateTime.now().setZone('America/Santiago').toISO({ suppressMilliseconds: false });
}

// Ya lo tienes:
function nowSCLSql121() {
  return DateTime.now().setZone('America/Santiago').toFormat("yyyy-LL-dd'T'HH:mm:ss.SSS");
}

module.exports = { nowSCLIso, nowSCLSql121 };
