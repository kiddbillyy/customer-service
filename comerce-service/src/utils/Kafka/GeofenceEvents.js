const { v4: uuidv4 } = require('uuid');
const { sendBatch } = require('../kafkaProducer');
const { nowSCLIso } = require('../dates');

const TOPIC = process.env.KAFKA_TOPIC_GEOFENCE || 'commerce.geofence.events';

function ensureHeaders(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v == null ? '' : String(v);
  return out;
}

const pick = (o, ...keys) => {
  for (const k of keys) {
    if (o && Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) return o[k];
  }
  return undefined;
};

// coverage: MultiPolygon [[[ [lon,lat], ... ]]] -> WKT
function coverageToWkt(coverage) {
  if (!Array.isArray(coverage) || coverage.length === 0) return undefined;

  const ringToStr = (ring) => ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
  const polyToStr = (poly) => `(${poly.map(ring => `(${ringToStr(ring)})`).join(', ')})`;

  const polys = coverage.map(polyToStr);
  return coverage.length === 1
    ? `POLYGON${polys[0]}`
    : `MULTIPOLYGON(${polys.join(', ')})`;
}

// Solo los campos solicitados (y tolerante a casing / fallback)
function pickGeofenceFields(g = {}) {
  const id = pick(g, 'Id', 'id');

  // IsActive directo o derivado desde status
  const rawIsActive = pick(g, 'IsActive', 'isActive', 'isactive');
  const status = pick(g, 'Status', 'status');
  const isActive =
    rawIsActive != null
      ? (rawIsActive === true || rawIsActive === 1)
      : String(status || '').toLowerCase() !== 'inactive';

  // GeographyArea: preferimos WKT si viene, si no lo derivamos desde coverage
  const geographyArea =
    pick(g, 'GeographyArea', 'geographyArea', 'wkt') ??
    coverageToWkt(pick(g, 'Coverage', 'coverage'));

  return {
    Id: id, // útil para key y trazabilidad
    Name: pick(g, 'Name', 'name'),
    Description: pick(g, 'Description', 'description'),
    GeographyArea: geographyArea,         // WKT
    IsActive: isActive,                   // boolean
    CreatedAt: pick(g, 'CreatedAt', 'createdAt', 'dateCreated'),
    UpdatedAt: pick(g, 'UpdatedAt', 'updatedAt', 'dateModified'),
  };
}

async function publishGeofenceEvent({ action, geofence, userId }) {
  const eventId = uuidv4();
  const occurredAt = nowSCLIso();

  const fields = pickGeofenceFields(geofence);
  const key = String(fields.Id ?? pick(geofence, 'Id', 'id') ?? '');

  const payload = {
    eventId,
    action,
    occurredAt,
    ...fields,
  };

  await sendBatch(TOPIC, [
    {
      key,
      value: JSON.stringify(payload),
      headers: ensureHeaders({
        action,
        eventId,
        'content-type': 'application/json',
        'occurred-at': occurredAt,
        'user-id': userId ?? '',
        'event-source': 'commerce-api/geofences',
      }),
    },
  ]);
}

module.exports = { publishGeofenceEvent };