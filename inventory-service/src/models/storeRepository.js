const pool = require('../config/db');   // tu pool a SAP

const StoreRepository = {
  
  getAll: async (max = 500) => {
    const [rows] = await pool.query(
      `SELECT [id_almacen]
      ,[nombre]
      ,[ubicacion]
      ,[date_created]
      ,[user_created]
      ,[last_modified]
      ,[user_modified]
      ,[status]
  FROM [inventory_service_db].[dbo].[almacenes]
  where nombre != 'no1' and nombre != 'no2'`
    );
    return rows;
  },


};

module.exports = StoreRepository;
