// utils/dates.js
const { DateTime } = require('luxon');

function nowSCLIso() {
  return DateTime.now().setZone('America/Santiago').toISO({ suppressMilliseconds: false });
}


function nowSCLSql121() {
  return DateTime.now().setZone('America/Santiago').toFormat("yyyy-LL-dd HH:mm:ss.SSS");
}

function toSCLIso(dateTime) {
  return (dateTime ?? DateTime.now())
    .setZone('America/Santiago')
    .toISO({ suppressMilliseconds: false });
}

function toSCLSql121(dateTime) {
  return (dateTime ?? DateTime.now())
    .setZone('America/Santiago')
    .toFormat("yyyy-LL-dd HH:mm:ss.SSS");
}


module.exports = { nowSCLIso, nowSCLSql121, toSCLIso, toSCLSql121 };
