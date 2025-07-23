const { catalogPool, catalogPoolConnect } = require('../config/dbnew');
const { sapPool, sapPoolConnect } = require('../config/dbnewsap');
const pLimit = require('p-limit');

async function syncAuxCatalogs() {
  console.time('⏱ Tiempo total aux');

 
  await Promise.all([catalogPoolConnect, sapPoolConnect]);

  const limit = pLimit(100);

  const tablas = [
    {
      nombre: 'CATEGORIA',
      sql: `SELECT Code, Name, U_PRIMER_NIVEL FROM [@CATEGORIA]`,
      merge: `
        MERGE INTO Categoria AS target
        USING (SELECT @Code AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = @Name, U_PRIMER_NIVEL = @U_PRIMER_NIVEL
        WHEN NOT MATCHED THEN
          INSERT (Code, Name, U_PRIMER_NIVEL) VALUES (@Code, @Name, @U_PRIMER_NIVEL);
      `
    },
    {
      nombre: 'PRIMERNIVEL',
      sql: `SELECT Code, Name FROM [@PRIMERNIVEL]`,
      merge: `
        MERGE INTO PrimerNivel AS target
        USING (SELECT @Code AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = @Name
        WHEN NOT MATCHED THEN
          INSERT (Code, Name) VALUES (@Code, @Name);
      `
    },
    {
      nombre: 'SUBCATEGORIA',
      sql: `SELECT Code, Name, U_CATEGORIA FROM [@SUBCATEGORIA]`,
      merge: `
        MERGE INTO Subcategoria AS target
        USING (SELECT @Code AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = @Name, U_CATEGORIA = @U_CATEGORIA
        WHEN NOT MATCHED THEN
          INSERT (Code, Name, U_CATEGORIA) VALUES (@Code, @Name, @U_CATEGORIA);
      `
    },
    {
      nombre: 'FAMILIA',
      sql: `SELECT Code, Name FROM [@FAMILIA]`,
      merge: `
        MERGE INTO Familia AS target
        USING (SELECT @Code AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = @Name
        WHEN NOT MATCHED THEN
          INSERT (Code, Name) VALUES (@Code, @Name);
      `
    },
    {
      nombre: 'SUBFAMILIA',
      sql: `SELECT Code, Name FROM [@SUBFAMILIA]`,
      merge: `
        MERGE INTO Subfamilia AS target
        USING (SELECT @Code AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = @Name
        WHEN NOT MATCHED THEN
          INSERT (Code, Name) VALUES (@Code, @Name);
      `
    }
  ];

  try {
    for (const t of tablas) {
      const sapResult = await sapPool.request().query(t.sql);
      const registros = sapResult.recordset;

      const tareas = registros.map((r, idx) =>
        limit(async () => {
          const catalogRequest = catalogPool.request();
          const valores = Object.entries(r);

          for (const [key, value] of valores) {
            catalogRequest.input(key, value);
          }

          await catalogRequest.query(t.merge);
          //if (idx % 100 === 0) console.log(` ↳ ${t.nombre}: ${idx} procesados...`);
        })
      );

      await Promise.all(tareas);
    }
  } catch (err) {
    console.error('❌ Error durante la sincronización:', err);
    return false;
  } finally {
    console.timeEnd('⏱ Tiempo total aux');
  }

  return true;
}

module.exports = { syncAuxCatalogs };