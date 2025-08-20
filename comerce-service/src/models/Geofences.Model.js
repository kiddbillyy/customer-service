// models/Geofences.Model.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');
const wkx = require('wkx');

// helpers
const pointEq = (a, b) => a[0] === b[0] && a[1] === b[1];


function validateCoverage(coverage) {
  if (!Array.isArray(coverage) || coverage.length === 0) return false;
  for (const polygon of coverage) {
    if (!Array.isArray(polygon) || polygon.length === 0) return false;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return false;
      const first = ring[0], last = ring[ring.length - 1];
      if (!pointEq(first, last)) return false; // ring debe estar cerrado
      for (const p of ring) {
        if (!Array.isArray(p) || p.length !== 2) return false;
        const [lon, lat] = p;
        if (typeof lon !== 'number' || typeof lat !== 'number') return false;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return false;
      }
    }
  }
  return true;
}

function mapRowToApi(row) {
  const base = {
    id: String(row.Id),
    name: row.Name,
    status: row.IsActive ? 'active' : 'inactive',
    dateCreated: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : null,
    userCreated: row.UserCreated || null,
    dateModified: (row.UpdatedAt || row.CreatedAt) ? new Date(row.UpdatedAt || row.CreatedAt).toISOString() : null,
    userModified: row.UserModified || row.UserCreated || null,
    description: row.Description || null,
  };
  // coverage solo si viene la columna (según includeCoverage)
  if (row.wkb || row.wkt) base.coverage = rowToCoverage(row);
  return base;
}
function rowToCoverage(row) {
  if (row.wkb) {
    const gj = wkx.Geometry.parse(Buffer.from(row.wkb)).toGeoJSON();
    return gj.type === 'Polygon' ? [gj.coordinates] :
           gj.type === 'MultiPolygon' ? gj.coordinates : [];
  }
  if (row.wkt) {
    const gj = wkx.Geometry.parse(row.wkt).toGeoJSON();
    return gj.type === 'Polygon' ? [gj.coordinates] :
           gj.type === 'MultiPolygon' ? gj.coordinates : [];
  }
  return [];
}

// CREATE
async function createGeofence({ name, status = 'active', description = null, coverage, user }) {
  if (!validateCoverage(coverage)) throw new Error('INVALID_COVERAGE');

  await IdServicePoolConnect;

  const covJson = JSON.stringify({ coverage });
  const r = await IdServicePool.request()
    .input('Id', sql.Int, null)
    .input('Name', sql.NVarChar(200), name)
    .input('Description', sql.NVarChar(500), description)
    .input('CoverageJson', sql.NVarChar(sql.MAX), covJson)
    .input('IsActive', sql.Bit, status === 'inactive' ? 0 : 1)
    .input('User', sql.NVarChar(5), user)
    .execute('dbo.Geofence_Upsert_FromCoverage');

  const row = r.recordset?.[0];
  return mapRowToApi(row); 
}

// UPDATE
async function updateGeofence({ id, name, status = 'active', description = null, coverage, user }) {
  if (!Number.isInteger(id)) throw new Error('GEOFENCE_NOT_FOUND');
  if (!validateCoverage(coverage)) throw new Error('INVALID_COVERAGE');

  await IdServicePoolConnect;

  // validar existencia
  const exists = (await IdServicePool.request()
    .input('id', sql.Int, id)
    .query('SELECT 1 AS ok FROM dbo.Geofence WHERE Id = @id')).recordset[0];
  if (!exists) throw new Error('GEOFENCE_NOT_FOUND');

  const covJson = JSON.stringify({ coverage });
  const r = await IdServicePool.request()
    .input('Id', sql.Int, id)
    .input('Name', sql.NVarChar(200), name)
    .input('Description', sql.NVarChar(500), description)
    .input('CoverageJson', sql.NVarChar(sql.MAX), covJson)
    .input('IsActive', sql.Bit, status === 'inactive' ? 0 : 1)
    .input('User', sql.NVarChar(5), user)
    .execute('dbo.Geofence_Upsert_FromCoverage');

  const row = r.recordset?.[0];
  return mapRowToApi(row); 
}

// GET BY ID
async function getGeofenceById({ id }) {
  await IdServicePoolConnect;

  const { recordset } = await IdServicePool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT 
        g.Id, g.Name, g.Description, g.IsActive, g.CreatedAt, g.UpdatedAt, g.UserCreated, g.UserModified,
        g.GeographyArea.STAsText() AS wkt
      FROM dbo.Geofence g
      WHERE g.Id = @id
    `);

  const row = recordset[0];
  if (!row) return null;
  return mapRowToApi(row);
}

// LIST
async function listGeofences({ includeCoverage = true, onlyActive = null } = {}) {
  await IdServicePoolConnect;

  const where = [];
  if (onlyActive === true) where.push('g.IsActive = 1');
  if (onlyActive === false) where.push('g.IsActive = 0');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Si pides cobertura, usa WKB (más eficiente que WKT)
  const selectGeom = includeCoverage
    ? 'g.GeographyArea.STAsBinary() AS wkb'
    : 'NULL AS wkb';

  const { recordset } = await IdServicePool.request()
    .query(`
      SELECT 
        g.Id, g.Name, g.Description, g.IsActive, g.CreatedAt, g.UpdatedAt, g.UserCreated, g.UserModified,
        ${selectGeom}
      FROM dbo.Geofence g
      ${whereSql}
      ORDER BY g.CreatedAt DESC, g.Id DESC
    `);

  return recordset.map(mapRowToApi);
}

module.exports = {
  createGeofence,
  updateGeofence,
  getGeofenceById,
  listGeofences
};
