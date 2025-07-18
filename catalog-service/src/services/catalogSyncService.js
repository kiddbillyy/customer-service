const sapPool = require('../config/dbSap');
const catalogPool = require('../config/db');
const pLimit = require('p-limit');

async function syncCatalogProducts() {
  const [productos] = await sapPool.query(`
    SELECT 
      ItemCode, ItemName, U_CCosto, SalUnitMsr, U_Marca, U_Categoria, U_Subcategoria,
      U_ValVcto, U_ReqPicking, ValidFor, InvntItem, ItmsGrpCod, U_Nombre_Fam,
      U_Nombre_SubFam, TaxCodeAR, SellItem, U_RPRO, CodeBars, InvntryUom,
      U_PRIMER_NIVEL, U_Imagen
    FROM OITM
  `);

  const limit = pLimit(1000); 

  const tareas = productos.map((p, idx) =>
    limit(async () => {
      try {
        await catalogPool.query(`
          MERGE INTO OITM_Products AS target
          USING (SELECT ? AS ItemCode) AS source
          ON target.ItemCode = source.ItemCode
          WHEN MATCHED THEN
            UPDATE SET 
              ItemName = ?, U_CCosto = ?, SalUnitMsr = ?, U_Marca = ?, U_Categoria = ?, 
              U_Subcategoria = ?, U_ValVcto = ?, U_ReqPicking = ?, ValidFor = ?, InvntItem = ?, 
              ItmsGrpCod = ?, U_Nombre_Fam = ?, U_Nombre_SubFam = ?, TaxCodeAR = ?, SellItem = ?, 
              U_RPRO = ?, CodeBars = ?, InvntryUom = ?, U_PRIMER_NIVEL = ?, U_Imagen = ?
          WHEN NOT MATCHED THEN
            INSERT (
              ItemCode, ItemName, U_CCosto, SalUnitMsr, U_Marca, U_Categoria, U_Subcategoria,
              U_ValVcto, U_ReqPicking, ValidFor, InvntItem, ItmsGrpCod, U_Nombre_Fam,
              U_Nombre_SubFam, TaxCodeAR, SellItem, U_RPRO, CodeBars, InvntryUom,
              U_PRIMER_NIVEL, U_Imagen
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `, [
          p.ItemCode,
          p.ItemName, p.U_CCosto, p.SalUnitMsr, p.U_Marca, p.U_Categoria, p.U_Subcategoria,
          p.U_ValVcto, p.U_ReqPicking, p.ValidFor, p.InvntItem, p.ItmsGrpCod, p.U_Nombre_Fam,
          p.U_Nombre_SubFam, p.TaxCodeAR, p.SellItem, p.U_RPRO, p.CodeBars, p.InvntryUom,
          p.U_PRIMER_NIVEL, p.U_Imagen,
          p.ItemCode, p.ItemName, p.U_CCosto, p.SalUnitMsr, p.U_Marca, p.U_Categoria, p.U_Subcategoria,
          p.U_ValVcto, p.U_ReqPicking, p.ValidFor, p.InvntItem, p.ItmsGrpCod, p.U_Nombre_Fam,
          p.U_Nombre_SubFam, p.TaxCodeAR, p.SellItem, p.U_RPRO, p.CodeBars, p.InvntryUom,
          p.U_PRIMER_NIVEL, p.U_Imagen
        ]);

        if (idx % 1000 === 0) {
          console.log(`Procesados ${idx} productos...`);
        }
      } catch (err) {
        console.error(`Error al procesar ItemCode ${p.ItemCode}:`, err.message);
      }
    })
  );

  await Promise.all(tareas);
  return productos.length;
}

module.exports = { syncCatalogProducts };
