// src/models/storeRepository.js
const { query } = require('../config/db');   // ✅ solo la función

const StoreRepository = {
  async getAll() {
    const [rows] = await query(`
      SELECT id_almacen, nombre, ubicacion, date_created,
             user_created, last_modified, user_modified, status
        FROM inventory_service_db.dbo.almacenes
       WHERE nombre NOT IN ('no1','no2');
    `);
    return rows;
  },
};

module.exports = StoreRepository;
