// syncAuxCatalogs.js
const { performance } = require('perf_hooks');
const { sql, sapPool }      = require('../config/dbnewsap');
const { catalogPool }       = require('../config/dbnew');

const CHUNK_INSERT = 1000;                      // filas por envío
const DEST_COLLATION = 'SQL_Latin1_General_CP850_CI_AS';

async function syncAuxCatalogs () {
  const t0 = performance.now();

  if (sapPool.connected     !== true) await sapPool.connect();
  if (catalogPool.connected !== true) await catalogPool.connect();

  const tx = new sql.Transaction(catalogPool);
  await tx.begin();

  /** Definición homogénea de cada catálogo */
  const tablas = [
    {
      nombre: 'Categoria',
      sapSql : 'SELECT Code, Name, U_PRIMER_NIVEL FROM [@CATEGORIA]',
      cols   : [
        { n: 'Code',           len: 50  },
        { n: 'Name',           len: 100 },
        { n: 'U_PRIMER_NIVEL', len: 50  }
      ],
      mergeSql: `
        MERGE dbo.Categoria WITH (HOLDLOCK) AS T
        USING #Delta AS S ON T.Code = S.Code
        WHEN MATCHED THEN
          UPDATE SET T.Name = S.Name,
                     T.U_PRIMER_NIVEL = S.U_PRIMER_NIVEL
        WHEN NOT MATCHED THEN
          INSERT (Code, Name, U_PRIMER_NIVEL)
          VALUES (S.Code, S.Name, S.U_PRIMER_NIVEL);`
    },
    {
      nombre: 'PrimerNivel',
      sapSql : 'SELECT Code, Name FROM [@PRIMERNIVEL]',
      cols   : [
        { n: 'Code', len: 50  },
        { n: 'Name', len: 100 }
      ],
      mergeSql: `
        MERGE dbo.PrimerNivel WITH (HOLDLOCK) AS T
        USING #Delta AS S ON T.Code = S.Code
        WHEN MATCHED THEN UPDATE SET T.Name = S.Name
        WHEN NOT MATCHED THEN INSERT (Code, Name) VALUES (S.Code, S.Name);`
    },
    {
      nombre: 'Subcategoria',
      sapSql : 'SELECT Code, Name, U_CATEGORIA FROM [@SUBCATEGORIA]',
      cols   : [
        { n: 'Code',        len: 50  },
        { n: 'Name',        len: 100 },
        { n: 'U_CATEGORIA', len: 200 }
      ],
      mergeSql: `
        MERGE dbo.Subcategoria WITH (HOLDLOCK) AS T
        USING #Delta AS S ON T.Code = S.Code
        WHEN MATCHED THEN
          UPDATE SET T.Name = S.Name,
                     T.U_CATEGORIA = S.U_CATEGORIA
        WHEN NOT MATCHED THEN
          INSERT (Code, Name, U_CATEGORIA)
          VALUES (S.Code, S.Name, S.U_CATEGORIA);`
    },
    {
      nombre: 'Familia',
      sapSql : 'SELECT Code, Name FROM [@FAMILIA]',
      cols   : [
        { n: 'Code', len: 50  },
        { n: 'Name', len: 100 }
      ],
      mergeSql: `
        MERGE dbo.Familia WITH (HOLDLOCK) AS T
        USING #Delta AS S ON T.Code = S.Code
        WHEN MATCHED THEN UPDATE SET T.Name = S.Name
        WHEN NOT MATCHED THEN INSERT (Code, Name) VALUES (S.Code, S.Name);`
    },
    {
      nombre: 'Subfamilia',
      sapSql : 'SELECT Code, Name FROM [@SUBFAMILIA]',
      cols   : [
        { n: 'Code', len: 50  },
        { n: 'Name', len: 100 }
      ],
      mergeSql: `
        MERGE dbo.Subfamilia WITH (HOLDLOCK) AS T
        USING #Delta AS S ON T.Code = S.Code
        WHEN MATCHED THEN UPDATE SET T.Name = S.Name
        WHEN NOT MATCHED THEN INSERT (Code, Name) VALUES (S.Code, S.Name);`
    }
  ];

  try {
    for (const t of tablas) {
      const sapRows = (await sapPool.request().query(t.sapSql)).recordset;
      if (!sapRows.length) continue;

      const ddlCols = t.cols
        .map(c => `${c.n} NVARCHAR(${c.len}) COLLATE ${DEST_COLLATION}`)
        .join(', ');
      await tx.request().batch(`
        IF OBJECT_ID('tempdb..#Delta') IS NOT NULL DROP TABLE #Delta;
        CREATE TABLE #Delta (${ddlCols});
      `);

      for (let i = 0; i < sapRows.length; i += CHUNK_INSERT) {
        const chunk = sapRows.slice(i, i + CHUNK_INSERT);
        const tvp = new sql.Table('#Delta');         // TVP apunta a #Delta
        tvp.create = false;
        t.cols.forEach(c => tvp.columns.add(c.n, sql.NVarChar(c.len), { nullable: true }));
        chunk.forEach(r => tvp.rows.add(...t.cols.map(c => r[c.n])));
        await tx.request().bulk(tvp);
      }

      await tx.request().query(t.mergeSql);
    }

    await tx.commit();
    console.log(`✔️  syncAuxCatalogs completado en ${(performance.now() - t0).toFixed(0)} ms`);
    return true;

  } catch (err) {
    try { await tx.rollback(); } catch {}
    console.error('❌ Error durante la sincronización:', err);
    throw err;
  }
}

module.exports = { syncAuxCatalogs };