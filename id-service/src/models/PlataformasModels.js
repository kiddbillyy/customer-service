const { sql, IdServicePool, IdServicePoolConnect } = require('../config/dbnew');

const insertarPlataforma = async (nombre, codigo, descripcion) => {
  try {
    const pool = await IdServicePool.connect();
    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('codigo', sql.NVarChar, codigo)
      .input('descripcion', sql.NVarChar, descripcion)
      .query(`
        INSERT INTO Plataformas (NOMBRE, CODIGO, DESCRIPCION)
        VALUES (@nombre, @codigo, @descripcion);
        SELECT SCOPE_IDENTITY() AS ID;
      `);

    return result.recordset[0]; 
  } catch (error) {
    console.error('Error insertando en Plataformas:', error);
    throw error;
  }
};

async function getPlataformas() {
  await IdServicePool.connect();

  const result = await IdServicePool.request().query(`
    SELECT 
      ID, 
      NOMBRE, 
      CODIGO, 
      DESCRIPCION
    FROM PLATAFORMAS
    ORDER BY NOMBRE;
  `);

  return result.recordset;
}

async function actualizarPlataforma({ id, nombre, descripcion }) {
  await IdServicePool.connect();

  const request = IdServicePool.request();
  request.input('ID', sql.Int, id);
  request.input('Nombre', sql.NVarChar(100), nombre);
  request.input('Descripcion', sql.NVarChar(sql.MAX), descripcion ?? null);

  const result = await request.query(`
    UPDATE PLATAFORMAS
    SET NOMBRE = @Nombre,
        DESCRIPCION = @Descripcion
    WHERE ID = @ID;

    SELECT ID, NOMBRE, CODIGO, DESCRIPCION
    FROM PLATAFORMAS
    WHERE ID = @ID;
  `);

  return result.recordset[0];
}

module.exports = {
  insertarPlataforma, getPlataformas, actualizarPlataforma
};
