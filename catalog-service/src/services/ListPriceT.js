// jobs/syncPriceLists.js
const { performance } = require('perf_hooks');
const { sql, sapPool } = require('../config/dbnewsap');
const { catalogPool }  = require('../config/dbnew');

const CHUNK_INSERT = 1000;

/* helper: obtiene “int”, “nvarchar(32)”, “char(1)”, etc. */
const decl = (t) => t.declaration
  ?? `${t.type.declaration}(${t.length ?? `${t.precision},${t.scale}`})`;

async function syncPriceLists () {
  const t0 = performance.now();
  if (!sapPool.connected)     await sapPool.connect();
  if (!catalogPool.connected) await catalogPool.connect();

  const tx = new sql.Transaction(catalogPool);
  await tx.begin();

  const tbl = {
    nombre : 'OPLN_PRICE_LIST',
    sapSql : `
      SELECT ListNum, ListName, GroupCode, UserSign, UserSign2,
             UpdateDate, ValidFor, ValidFrom, ValidTo, CreateDate
      FROM   OPLN`,
    cols : [
      { n:'ListNum',    sqlType: sql.Int,          notNull:true },
      { n:'ListName',   sqlType: sql.NVarChar(32)               },
      { n:'GroupCode',  sqlType: sql.SmallInt                   },
      { n:'UserSign',   sqlType: sql.SmallInt                   },
      { n:'UserSign2',  sqlType: sql.SmallInt                   },
      { n:'UpdateDate', sqlType: sql.DateTime                   },
      { n:'ValidFor',   sqlType: sql.Char(1)                    },
      { n:'ValidFrom',  sqlType: sql.DateTime                   },
      { n:'ValidTo',    sqlType: sql.DateTime                   },
      { n:'CreateDate', sqlType: sql.DateTime                   }
    ],
    mergeSql : `
      MERGE dbo.OPLN_PRICE_LIST WITH (HOLDLOCK) AS T
      USING #Delta AS S ON T.ListNum = S.ListNum
      WHEN MATCHED THEN UPDATE SET
        T.ListName   = S.ListName,
        T.GroupCode  = S.GroupCode,
        T.UserSign   = S.UserSign,
        T.UserSign2  = S.UserSign2,
        T.UpdateDate = S.UpdateDate,
        T.ValidFor   = S.ValidFor,
        T.ValidFrom  = S.ValidFrom,
        T.ValidTo    = S.ValidTo,
        T.CreateDate = S.CreateDate
      WHEN NOT MATCHED THEN INSERT (
        ListNum, ListName, GroupCode, UserSign, UserSign2,
        UpdateDate, ValidFor, ValidFrom, ValidTo, CreateDate
      ) VALUES (
        S.ListNum, S.ListName, S.GroupCode, S.UserSign, S.UserSign2,
        S.UpdateDate, S.ValidFor, S.ValidFrom, S.ValidTo, S.CreateDate
      );`
  };

  try {
    console.log(`Sincronizando tabla: ${tbl.nombre}…`);
    const sapRows = (await sapPool.request().query(tbl.sapSql)).recordset;
    if (!sapRows.length) { console.log('Sin datos.'); await tx.commit(); return; }

    /* 1│ DDL idéntico */
    const ddl = tbl.cols
      .map(c => `${c.n} ${decl(c.sqlType)} ${c.notNull ? 'NOT NULL' : 'NULL'}`)
      .join(', ');
    await tx.request().batch(`
      IF OBJECT_ID('tempdb..#Delta') IS NOT NULL DROP TABLE #Delta;
      CREATE TABLE #Delta (${ddl});
    `);

    /* 2│ bulk TVP idéntico */
    for (let i = 0; i < sapRows.length; i += CHUNK_INSERT) {
      const tvp = new sql.Table('#Delta'); tvp.create = false;
      tbl.cols.forEach(c =>
        tvp.columns.add(c.n, c.sqlType, { nullable: !c.notNull })
      );
      sapRows.slice(i, i + CHUNK_INSERT)
             .forEach(r => tvp.rows.add(...tbl.cols.map(c => r[c.n])));
      await tx.request().bulk(tvp);
    }

    /* 3│ MERGE */
    await tx.request().query(tbl.mergeSql);
    await tx.commit();
    console.log(`✔️  syncPriceLists completado en ${(performance.now()-t0).toFixed(0)} ms`);
    return true;

  } catch (err) {
    try { await tx.rollback(); } catch {}
    console.error('❌ Error en syncPriceLists:', err);
    throw err;
  }
}

module.exports = { syncPriceLists };
