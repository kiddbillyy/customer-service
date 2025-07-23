const sapPool = require('../config/dbSap');
const catalogPool = require('../config/db');
const pLimit = require('p-limit');

async function syncGroup() {
  console.log('🔁 Iniciando sincronización de tablas auxiliares...');
  console.time('⏱ Tiempo total aux');

  const limit = pLimit(100);

  const tablas = [
    {
      nombre: 'OITB_GROUP',
      sql: `
        SELECT ItmsGrpCod, ItmsGrpNam, UserSign, CreateDate, userSign2, updateDate, U_CAT_COM
        FROM OITB
      `,
      merge: `
        MERGE INTO OITB_GROUP AS target
        USING (
          SELECT ? AS ItmsGrpCod
        ) AS source
        ON target.ItmsGrpCod = source.ItmsGrpCod
        WHEN MATCHED THEN
          UPDATE SET 
            ItmsGrpNam = ?, 
            UserSign = ?, 
            CreateDate = ?, 
            userSign2 = ?, 
            updateDate = ?, 
            U_CAT_COM = ?
        WHEN NOT MATCHED THEN
          INSERT (
            ItmsGrpCod, ItmsGrpNam, UserSign, CreateDate, userSign2, updateDate, U_CAT_COM
          ) VALUES (?, ?, ?, ?, ?, ?, ?);
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

  console.timeEnd('⏱ Tiempo total aux');
  return true;
}

module.exports = { syncGroup };
