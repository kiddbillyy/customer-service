// utils/dates.js
const TZ = process.env.OMS_TZ || 'America/Santiago';
const { DateTime } = require('luxon');

function nowSCLIso() {
  // ISO con zona America/Santiago, incluye milisegundos y offset
  return DateTime.now().setZone('America/Santiago').toISO({ suppressMilliseconds: false });
}

// Ya lo tienes:
function nowSCLSql121() {
  return DateTime.now().setZone('America/Santiago').toFormat("yyyy-LL-dd HH:mm:ss.SSS");
}


function formatDDMMYYYY_HHmmss_UTC(date) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function formatDDMMYYYY_HHmmss_TZ(date, timeZone = TZ) {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

module.exports = { formatDDMMYYYY_HHmmss_UTC, formatDDMMYYYY_HHmmss_TZ, nowSCLIso, nowSCLSql121 };
