const { catalogPool, catalogPoolConnect } = require('../config/dbnew');
const { sapPool, sapPoolConnect } = require('../config/dbnewsap');
const pLimit = require('p-limit');

async function syncGroup() {
  console.time('⏱ Tiempo total aux');
  await Promise.all([catalogPoolConnect, sapPoolConnect]);

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
          SELECT @ItmsGrpCod AS ItmsGrpCod
        ) AS source
        ON target.ItmsGrpCod = source.ItmsGrpCod
        WHEN MATCHED THEN
          UPDATE SET 
            ItmsGrpNam = @ItmsGrpNam, 
            UserSign = @UserSign, 
            CreateDate = @CreateDate, 
            userSign2 = @userSign2, 
            updateDate = @updateDate, 
            U_CAT_COM = @U_CAT_COM
        WHEN NOT MATCHED THEN
          INSERT (
            ItmsGrpCod, ItmsGrpNam, UserSign, CreateDate, userSign2, updateDate, U_CAT_COM
          ) VALUES (@ItmsGrpCod, @ItmsGrpNam, @UserSign, @CreateDate, @userSign2, @updateDate, @U_CAT_COM);
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
          for (const [key, value] of Object.entries(r)) {
            catalogRequest.input(key, value);
          }

          await catalogRequest.query(t.merge);
          if (idx % 100 === 0) console.log(` ↳ ${t.nombre}: ${idx} procesados...`);
        })
      );

      await Promise.all(tareas);
    }
  } catch (err) {
    console.error(' ¡Error durante la sincronización:!', err);
    return false;
  } finally {
    console.timeEnd('⏱ Tiempo total aux');
  }

  return true;
}
module.exports = { syncGroup };