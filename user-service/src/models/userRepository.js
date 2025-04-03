const pool = require('../config/db');

const UserRepository = {
  // Busca usuario por email (útil para login)
  findByEmail: async (email) => {
    const [rows] = await pool.query(`
      SELECT u.*, r.roleName, s.statusName
      FROM user_service_db.users u
      LEFT JOIN user_service_db.roles r ON u.roleID = r.roleID
      LEFT JOIN user_service_db.user_Status s ON u.statusID = s.statusID
      WHERE u.email = ?
    `, [email]);
    return rows[0] || null;
  },

  // Busca usuario por rut
  findByRut: async (rut) => {
    const [rows] = await pool.query(`
      SELECT u.*, r.roleName, s.statusName
      FROM user_service_db.users u
      LEFT JOIN user_service_db.roles r ON u.roleID = r.roleID
      LEFT JOIN user_service_db.user_Status s ON u.statusID = s.statusID
      WHERE u.rut = ?
    `, [rut]);
    return rows[0] || null;
  },

  // Crea un nuevo usuario
  createUser: async (userData) => {
    const { rut, name, email, passwordHash, roleID, statusID } = userData;
    await pool.query(`
      INSERT INTO user_service_db.users (rut, name, email, password, roleID, statusID, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, GETDATE())
    `, [rut, name, email, passwordHash, roleID, statusID]);
    
    return rut; // Ya lo tienes
  },

  // Actualiza un usuario (ej: cambiar rol o status)
  updateUser: async (rut, fields) => {
    const { name, email, roleID, statusID } = fields;
  
    const [result] = await pool.query(`
      UPDATE user_service_db.users
      SET name = ?, email = ?, roleID = ?, statusID = ?
      WHERE rut = ?
    `, [name, email, roleID, statusID, rut]);
  
    return result.rowsAffected[0] > 0;
  },

  // Lista todos los usuarios
  getAllUsers: async () => {
    const [rows] = await pool.query(`
      SELECT u.rut, u.name, u.email, r.roleName, s.statusName
      FROM user_service_db.users u
      LEFT JOIN user_service_db.roles r ON u.roleID = r.roleID
      LEFT JOIN user_service_db.user_status s ON u.statusID = s.statusID
    `);
    return rows;
  },
  getAllActiveUsers: async () => {
    const [rows] = await pool.query(`
      SELECT u.rut, u.name, u.email, r.roleName, s.statusName
      FROM user_service_db.users u
      LEFT JOIN user_service_db.roles r ON u.roleID = r.roleID
      LEFT JOIN user_service_db.user_Status s ON u.statusID = s.statusID
      where u.statusID = 1;
    `);
    return rows;
  },



  // Elimina usuario por rut
  deleteUser: async (rut) => {
    const [result] = await pool.query(`
      DELETE FROM user_service_db.users WHERE rut = ?
    `, [rut]);
  
    return result.rowsAffected[0] > 0;
  },

  // Roles
  getAllRoles: async () => {
    const [rows] = await pool.query(`SELECT * FROM user_service_db.roles`);
    return rows;
  },

  // Status
  getAllStatus: async () => {
    const [rows] = await pool.query(`SELECT * FROM user_service_db.user_Status`);
    return rows;
  }
};

module.exports = UserRepository;