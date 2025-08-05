const { sql, IdServicePool, IdServicePoolConnect } = require('../config/dbnew');

async function findAll({ soloActivos = false, buscar = null } = {}) {
  await IdServicePoolConnect;

  const where = [];
  const req = IdServicePool.request();

  if (soloActivos) {
    where.push('d.Estado = 1');
  }

  if (buscar) {
    where.push('d.Nombre LIKE @Buscar');
    req.input('Buscar', sql.NVarChar(100), `%${buscar}%`);
  }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const q = `
    SELECT
      d.DepartamentoID       AS DepartmentId,
      d.Nombre               AS Name,
      d.Descripcion          AS Description,
      d.FechaCreacion        AS CreatedAt,
      d.FechaActualizacion   AS UpdatedAt,
      d.Estado               AS Status,
      d.Contacto             AS Contact,
      d.UsuarioCreador       AS CreatedById,
      d.UsuarioActualizador  AS UpdatedById,
      pc.Nombres             AS CreatedByName,
      pa.Nombres             AS UpdatedByName
    FROM dbo.Departamentos AS d
    LEFT JOIN dbo.Perfiles AS pc ON pc.UsuarioID = d.UsuarioCreador
    LEFT JOIN dbo.Perfiles AS pa ON pa.UsuarioID = d.UsuarioActualizador
    ${whereSQL};
  `;

  const { recordset } = await req.query(q);
  return recordset;
}

async function create({ nombre, descripcion = null, contacto = null, estado = 1, usuarioCreador }) {
  await IdServicePoolConnect;

  const req = IdServicePool.request()
    .input('Nombre',          sql.NVarChar(100), nombre)
    .input('Descripcion',     sql.NVarChar(sql.MAX), descripcion)
    .input('Contacto',        sql.NVarChar(255), contacto)
    .input('Estado',          sql.Bit, Number(estado) === 0 ? 0 : 1)
    .input('UsuarioCreador',  sql.Int, usuarioCreador ?? null);

  const q = `
    INSERT INTO dbo.Departamentos
      (Nombre, Descripcion, FechaCreacion, FechaActualizacion, Estado, Contacto, UsuarioCreador, UsuarioActualizador)
    OUTPUT inserted.DepartamentoID, inserted.Nombre, inserted.Descripcion,
           inserted.FechaCreacion, inserted.FechaActualizacion,
           inserted.Estado, inserted.Contacto,
           inserted.UsuarioCreador, inserted.UsuarioActualizador
    VALUES (@Nombre, @Descripcion, GETDATE(), NULL, @Estado, @Contacto, @UsuarioCreador, NULL);
  `;

  const { recordset } = await req.query(q);
  return recordset[0];
}

module.exports = {
  findAll,
  create
};
