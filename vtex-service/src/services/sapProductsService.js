// src/services/sapProductsService.js
const { sapPoolConnect, sapPool, sql } = require('../config/dbSap');

/**
 * Devuelve lotes de SKUs activos desde SAP (OITM).
 * Ajusta el WHERE a tu definición de "activo" si fuese necesario.
 */
async function* streamActiveSkus(batchSize = 1000) {
  await sapPoolConnect;
  let last = ''; // ItemCode último procesado

  while (true) {
    const req = sapPool.request()
      .input('last', sql.NVarChar, last)
      .input('batch', sql.Int, batchSize);

    const { recordset } = await req.query(`
      SELECT TOP (@batch)
        ItemCode          AS Sku,
        ItemName          AS [Description],
        U_MARCA           AS U_MARCA,
        U_CATEGORIA       AS U_CATEGORIA,
        U_SUBCATEGORIA    AS U_SUBCATEGORIA,
        U_PRIMER_NIVEL    AS U_PRIMER_NIVEL,
        U_IMAGEN          AS U_IMAGEN
      FROM OITM WITH (NOLOCK)
      WHERE ValidFor = 'Y' AND (FrozenFor IS NULL OR FrozenFor = 'N')
        AND ItemCode > @last
      ORDER BY ItemCode
    `);

    if (!recordset.length) break;
    last = recordset[recordset.length - 1].Sku;
    yield recordset;
  }
}

module.exports = { streamActiveSkus };
