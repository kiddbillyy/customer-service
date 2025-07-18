const sapPool = require('../config/dbSap');
const catalogPool = require('../config/db');

async function syncPriceList() {
  const [precios] = await sapPool.query(`
    SELECT 
	  ItemCode,
	  PriceList,
	  Price
    FROM ITM1;
    `
);
  for (const p of precios) {
    await catalogPool.query(`
      MERGE INTO dbo.ITM1_ListPrice AS target
      USING (SELECT ? AS ItemCode, ? AS PriceList) AS source
      ON target.ItemCode = source.ItemCode
         AND target.PriceList = source.PriceList
      WHEN MATCHED THEN
        UPDATE SET 
          Price = ?
      WHEN NOT MATCHED THEN
        INSERT (ItemCode, PriceList, Price)
        VALUES (?, ?, ?);
    `, [
      p.ItemCode, p.PriceList, p.Price,
      p.ItemCode, p.PriceList, p.Price
    ]);
  }

  return precios.length;
}

module.exports = { syncPriceList };
