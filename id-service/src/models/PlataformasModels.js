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

module.exports = {
  insertarPlataforma,
};
