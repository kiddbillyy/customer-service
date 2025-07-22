const sapPool = require('../config/dbSap');
const catalogPool = require('../config/db');
const pLimit = require('p-limit');

async function syncAuxCatalogs() {
  console.log(' Iniciando sincronización de tablas auxiliares...');
  console.time('⏱ Tiempo total aux');

  const limit = pLimit(100);

  const tablas = [
    {
      nombre: 'CATEGORIA',
      sql: `SELECT Code, Name, U_PRIMER_NIVEL FROM [@CATEGORIA]`,
      merge: `
        MERGE INTO Categoria AS target
        USING (SELECT ? AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = ?, U_PRIMER_NIVEL = ?
        WHEN NOT MATCHED THEN
          INSERT (Code, Name, U_PRIMER_NIVEL) VALUES (?, ?, ?);
      `
    },
    {
      nombre: 'PRIMERNIVEL',
      sql: `SELECT Code, Name FROM [@PRIMERNIVEL]`,
      merge: `
        MERGE INTO PrimerNivel AS target
        USING (SELECT ? AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = ?
        WHEN NOT MATCHED THEN
          INSERT (Code, Name) VALUES (?, ?);
      `
    },
    {
      nombre: 'SUBCATEGORIA',
      sql: `SELECT Code, Name, U_CATEGORIA FROM [@SUBCATEGORIA]`,
      merge: `
        MERGE INTO Subcategoria AS target
        USING (SELECT ? AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = ?, U_CATEGORIA = ?
        WHEN NOT MATCHED THEN
          INSERT (Code, Name, U_CATEGORIA) VALUES (?, ?, ?);
      `
    },
    {
      nombre: 'FAMILIA',
      sql: `SELECT Code, Name FROM [@FAMILIA]`,
      merge: `
        MERGE INTO Familia AS target
        USING (SELECT ? AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = ?
        WHEN NOT MATCHED THEN
          INSERT (Code, Name) VALUES (?, ?);
      `
    },
    {
      nombre: 'SUBFAMILIA',
      sql: `SELECT Code, Name FROM [@SUBFAMILIA]`,
      merge: `
        MERGE INTO Subfamilia AS target
        USING (SELECT ? AS Code) AS source
        ON target.Code = source.Code
        WHEN MATCHED THEN
          UPDATE SET Name = ?
        WHEN NOT MATCHED THEN
          INSERT (Code, Name) VALUES (?, ?);
      `
    }
  ];

  for (const t of tablas) {
    const [registros] = await sapPool.query(t.sql);
    console.log(`🔹 Sincronizando ${t.nombre}: ${registros.length} registros...`);

    const tareas = registros.map((r, idx) =>
      limit(async () => {
        const valores = Object.values(r);
        await catalogPool.query(t.merge, [...valores, ...valores]);
        if (idx % 100 === 0) console.log(`  ↳ ${t.nombre}: ${idx} procesados...`);
      })
    );

    await Promise.all(tareas);
    console.log(`✅ ${t.nombre} sincronizado (${registros.length})`);
  }

  console.timeEnd('⏱️ Tiempo total aux');
  return true;
}

module.exports = { syncAuxCatalogs };
