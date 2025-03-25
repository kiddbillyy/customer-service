const pool = require('../config/db');

const UserRepository = {
  // Busca usuario por email (útil para login)
  findByEmail: async (email) => {
    const [rows] = await pool.query(`
      SELECT u.*, r.roleName, s.statusName
      FROM Users u
      LEFT JOIN Roles r ON u.roleID = r.roleID
      LEFT JOIN User_Status s ON u.statusID = s.statusID
      WHERE u.email = ?
    `, [email]);
    return rows[0] || null;
  },

  // Busca usuario por rut
  findByRut: async (rut) => {
    const [rows] = await pool.query(`
      SELECT u.*, r.roleName, s.statusName
      FROM Users u
      LEFT JOIN Roles r ON u.roleID = r.roleID
      LEFT JOIN User_Status s ON u.statusID = s.statusID
      WHERE u.rut = ?
    `, [rut]);
    return rows[0] || null;
  },

  // Crea un nuevo usuario
  createUser: async (userData) => {
    const { rut, name, email, passwordHash, roleID, statusID } = userData;
    const [result] = await pool.query(`
      INSERT INTO Users (rut, name, email, password, roleID, statusID, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `, [rut, name, email, passwordHash, roleID, statusID]);
    return result.insertId; // O retornar rut si es PK
  },

  // Actualiza un usuario (ej: cambiar rol o status)
  updateUser: async (rut, fields) => {
    const { name, email, roleID, statusID } = fields;
    const [result] = await pool.query(`
      UPDATE Users
      SET name = ?, email = ?, roleID = ?, statusID = ?
      WHERE rut = ?
    `, [name, email, roleID, statusID, rut]);
    return result.affectedRows > 0;
  },

  // Lista todos los usuarios
  getAllUsers: async () => {
    const [rows] = await pool.query(`
      SELECT u.rut, u.name, u.email, r.roleName, s.statusName
      FROM Users u
      LEFT JOIN Roles r ON u.roleID = r.roleID
      LEFT JOIN User_Status s ON u.statusID = s.statusID
    `);
    return rows;
  },
  getAllActiveUsers: async () => {
    const [rows] = await pool.query(`
      SELECT u.rut, u.name, u.email, r.roleName, s.statusName
      FROM Users u
      LEFT JOIN Roles r ON u.roleID = r.roleID
      LEFT JOIN User_Status s ON u.statusID = s.statusID
      where u.statusID = 1;
    `);
    return rows;
  },



  // Elimina usuario por rut
  deleteUser: async (rut) => {
    const [result] = await pool.query(`
      DELETE FROM Users WHERE rut = ?
    `, [rut]);
    return result.affectedRows > 0;
  },

  // Roles
  getAllRoles: async () => {
    const [rows] = await pool.query(`SELECT * FROM Roles`);
    return rows;
  },

  // Status
  getAllStatus: async () => {
    const [rows] = await pool.query(`SELECT * FROM User_Status`);
    return rows;
  }
};

module.exports = UserRepository;