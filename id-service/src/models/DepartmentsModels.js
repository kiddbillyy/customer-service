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

      -- Creador
      pc.Nombres             AS CreatedFirstName,
      pc.Apellidos           AS CreatedLastName,
      uc.CorreoElectronico   AS CreatedEmail,
      pc.URLImagenPerfil     AS CreatedImage,

      -- Actualizador
      pa.Nombres             AS UpdatedFirstName,
      pa.Apellidos           AS UpdatedLastName,
      ua.CorreoElectronico   AS UpdatedEmail,
      pa.URLImagenPerfil     AS UpdatedImage

    FROM dbo.Departamentos AS d
    LEFT JOIN dbo.Perfiles AS pc ON pc.UsuarioID = d.UsuarioCreador
    LEFT JOIN dbo.Usuarios AS uc ON uc.UsuarioID = d.UsuarioCreador

    LEFT JOIN dbo.Perfiles AS pa ON pa.UsuarioID = d.UsuarioActualizador
    LEFT JOIN dbo.Usuarios AS ua ON ua.UsuarioID = d.UsuarioActualizador

    ${whereSQL};
  `;

  const { recordset } = await req.query(q);

  return recordset.map(row => ({
    DepartmentId: row.DepartmentId,
    Name: row.Name,
    Description: row.Description,
    CreatedAt: row.CreatedAt,
    UpdatedAt: row.UpdatedAt,
    Status: row.Status,
    Contact: row.Contact,

    creador: {
      id: row.CreatedById,
      nombre: `${row.CreatedFirstName || ''} ${row.CreatedLastName || ''}`.trim(),
      correo: row.CreatedEmail,
      imagen: row.CreatedImage
    },
    actualizador: {
      id: row.UpdatedById,
      nombre: `${row.UpdatedFirstName || ''} ${row.UpdatedLastName || ''}`.trim(),
      correo: row.UpdatedEmail,
      imagen: row.UpdatedImage
    }
  }));
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

async function update({
  departamentoId,
  nombre,
  descripcion = null,
  contacto = null,
  estado = 1,
  usuarioActualizador
}) {
  await IdServicePoolConnect;

  const req = IdServicePool.request()
    .input('DepartamentoID', sql.Int, departamentoId)
    .input('Nombre', sql.NVarChar(100), nombre)
    .input('Descripcion', sql.NVarChar(sql.MAX), descripcion)
    .input('Contacto', sql.NVarChar(255), contacto)
    .input('Estado', sql.Bit, Number(estado) === 0 ? 0 : 1)
    .input('UsuarioActualizador', sql.Int, usuarioActualizador);

  const query = `
    UPDATE dbo.Departamentos
    SET 
      Nombre = @Nombre,
      Descripcion = @Descripcion,
      Contacto = @Contacto,
      Estado = @Estado,
      UsuarioActualizador = @UsuarioActualizador,
      FechaActualizacion = GETDATE()
    OUTPUT 
      inserted.DepartamentoID, inserted.Nombre, inserted.Descripcion,
      inserted.Contacto, inserted.Estado,
      inserted.UsuarioCreador, inserted.UsuarioActualizador,
      inserted.FechaCreacion, inserted.FechaActualizacion
    WHERE DepartamentoID = @DepartamentoID;
  `;

  const { recordset } = await req.query(query);
  return recordset[0]; 
}

module.exports = {
  findAll,
  create, update
};
