// models/LocationGeo.Model.js
const { IdServicePool, IdServicePoolConnect, sql } = require('../config/dbnew');
const wkx = require('wkx');

function toBoolBit(v) {
  if (v === true || v === 1 || String(v).toLowerCase() === 'active') return 1;
  if (v === false || v === 0 || String(v).toLowerCase() === 'inactive') return 0;
  return null;
}

function parseWkbToCoverage(wkb) {
  if (wkb == null) return undefined;
  try {
    const buf = Buffer.isBuffer(wkb) ? wkb : Buffer.from(wkb);
    const gj = wkx.Geometry.parse(buf).toGeoJSON();
    return gj.type === 'Polygon' ? [gj.coordinates]
         : gj.type === 'MultiPolygon' ? gj.coordinates : [];
  } catch { return undefined; }
}

// Crea vínculo Location-Geofence
async function link({ locationId, geofenceId }) {
  if (!Number.isInteger(locationId)) throw new Error('INVALID_LOCATION_ID');
  if (!Number.isInteger(geofenceId)) throw new Error('INVALID_GEOFENCE_ID');

  await IdServicePoolConnect;

  // valida existencia
  const req = IdServicePool.request();
  const [loc, geo] = await Promise.all([
    req.input('lid', sql.Int, locationId).query('SELECT 1 ok FROM dbo.Location WHERE Id=@lid'),
    IdServicePool.request().input('gid', sql.Int, geofenceId).query('SELECT 1 ok FROM dbo.Geofence WHERE Id=@gid')
  ]);
  if (!loc.recordset[0]) throw new Error('LOCATION_NOT_FOUND');
  if (!geo.recordset[0]) throw new Error('GEOFENCE_NOT_FOUND');

  // evita duplicados
  const dup = (await IdServicePool.request()
    .input('lid', sql.Int, locationId)
    .input('gid', sql.Int, geofenceId)
    .query('SELECT Id FROM dbo.LocationGeo WHERE LocationId=@lid AND GeofenceId=@gid')
  ).recordset[0];
  if (dup) return { id: dup.Id, duplicated: true };

  const ins = await IdServicePool.request()
    .input('lid', sql.Int, locationId)
    .input('gid', sql.Int, geofenceId)
    .query(`
      INSERT INTO dbo.LocationGeo (LocationId, GeofenceId)
      OUTPUT INSERTED.Id
      VALUES (@lid, @gid);
    `);

  return { id: ins.recordset[0].Id, duplicated: false };
}

// Elimina vínculo por Id
async function unlinkById({ id }) {
  if (!Number.isInteger(id)) throw new Error('INVALID_LINK_ID');
  await IdServicePoolConnect;

  const r = await IdServicePool.request()
    .input('id', sql.Int, id)
    .query(`DELETE FROM dbo.LocationGeo WHERE Id=@id; SELECT @@ROWCOUNT AS rc;`);
  if (r.recordset[0].rc === 0) throw new Error('LINK_NOT_FOUND');
  return { id };
}

// Elimina vínculo por par (LocationId, GeofenceId)
async function unlinkByPair({ locationId, geofenceId }) {
  if (!Number.isInteger(locationId) || !Number.isInteger(geofenceId)) throw new Error('INVALID_PARAMS');
  await IdServicePoolConnect;

  const r = await IdServicePool.request()
    .input('lid', sql.Int, locationId)
    .input('gid', sql.Int, geofenceId)
    .query(`DELETE FROM dbo.LocationGeo WHERE LocationId=@lid AND GeofenceId=@gid; SELECT @@ROWCOUNT AS rc;`);
  if (r.recordset[0].rc === 0) throw new Error('LINK_NOT_FOUND');
  return { locationId, geofenceId };
}

// Geofences de una Location (opcional coverage)
async function getGeofencesByLocation({ locationId, includeCoverage = false, onlyActive = null }) {
  if (!Number.isInteger(locationId)) throw new Error('INVALID_LOCATION_ID');
  await IdServicePoolConnect;

  const whereActive = toBoolBit(onlyActive);
  const req = IdServicePool.request()
    .input('lid', sql.Int, locationId);
  const activeSql = whereActive === null ? '' : 'AND g.IsActive = @active';
  if (whereActive !== null) req.input('active', sql.Bit, whereActive);

  const geomSel = includeCoverage ? 'g.GeographyArea.STAsBinary() AS wkb' : 'NULL AS wkb';

  const { recordset } = await req.query(`
    SELECT g.Id, g.Name, g.Description, g.IsActive, g.CreatedAt, g.UpdatedAt, g.UserCreated, g.UserModified,
           ${geomSel}
    FROM dbo.LocationGeo lg
    JOIN dbo.Geofence g ON g.Id = lg.GeofenceId
    WHERE lg.LocationId = @lid
      ${activeSql}
    ORDER BY g.CreatedAt DESC, g.Id DESC;
  `);

  return recordset.map(r => ({
    id: String(r.Id),
    name: r.Name,
    description: r.Description,
    status: r.IsActive ? 'active' : 'inactive',
    dateCreated: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : null,
    dateModified: r.UpdatedAt ? new Date(r.UpdatedAt).toISOString() : null,
    userCreated: r.UserCreated || null,
    userModified: r.UserModified || null,
    ...(includeCoverage ? { coverage: parseWkbToCoverage(r.wkb) } : {})
  }));
}

// Locations de una Geofence
async function getLocationsByGeofence({ geofenceId, onlyActive = null }) {
  if (!Number.isInteger(geofenceId)) throw new Error('INVALID_GEOFENCE_ID');
  await IdServicePoolConnect;

  const whereActive = toBoolBit(onlyActive);
  const req = IdServicePool.request()
    .input('gid', sql.Int, geofenceId);
  const activeSql = whereActive === null ? '' : 'AND l.Status = @active';
  if (whereActive !== null) req.input('active', sql.Bit, whereActive);

  const { recordset } = await req.query(`
    SELECT l.Id, l.StoreId, l.Name, l.Country, l.StateProvince, l.City,
           l.AddressLine1, l.AddressLine2, l.PostalCode,
           l.Status, l.CreatedAt, l.UpdatedAt, l.UserCreated, l.UserModified
    FROM dbo.LocationGeo lg
    JOIN dbo.Location l ON l.Id = lg.LocationId
    WHERE lg.GeofenceId = @gid
      ${activeSql}
    ORDER BY l.CreatedAt DESC, l.Id DESC;
  `);

  return recordset.map(r => ({
    id: String(r.Id),
    storeId: r.StoreId,
    name: r.Name,
    country: r.Country,
    stateProvince: r.StateProvince,
    city: r.City,
    addressLine1: r.AddressLine1,
    addressLine2: r.AddressLine2,
    postalCode: r.PostalCode,
    status: r.Status ? 'active' : 'inactive',
    dateCreated: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : null,
    dateModified: r.UpdatedAt ? new Date(r.UpdatedAt).toISOString() : null,
    userCreated: r.UserCreated || null,
    userModified: r.UserModified || null
  }));
}

// Listado de vínculos (filtros + paginación)
async function listLinks({ locationId = null, geofenceId = null, page = 1, pageSize = 100 } = {}) {
  await IdServicePoolConnect;

  const where = [];
  const req = IdServicePool.request();
  if (Number.isInteger(locationId)) { where.push('lg.LocationId = @lid'); req.input('lid', sql.Int, locationId); }
  if (Number.isInteger(geofenceId)) { where.push('lg.GeofenceId = @gid'); req.input('gid', sql.Int, geofenceId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const take = Math.max(1, Math.min(1000, Number(pageSize) || 100));
  const skip = Math.max(0, (Number(page) || 1) - 1) * take;
  req.input('Skip', sql.Int, skip).input('Take', sql.Int, take);

  const { recordset } = await req.query(`
    WITH page AS (
      SELECT lg.Id
      FROM dbo.LocationGeo lg
      ${whereSql}
      ORDER BY lg.Id DESC
      OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY
    )
    SELECT lg.Id, lg.LocationId, lg.GeofenceId
    FROM page p JOIN dbo.LocationGeo lg ON lg.Id = p.Id
    ORDER BY lg.Id DESC;
  `);

  return recordset.map(r => ({ id: String(r.Id), locationId: r.LocationId, geofenceId: r.GeofenceId }));
}

module.exports = {
  link,
  unlinkById,
  unlinkByPair,
  getGeofencesByLocation,
  getLocationsByGeofence,
  listLinks
};
