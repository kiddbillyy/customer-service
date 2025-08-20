const UserRepository = require('../models/userRepository');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET || 'supersecret';
const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // Ajusta a tu preferencia

const AuthService = {
  registerUser: async (userData) => {
    // Verificar si email ya existe
    const existing = await UserRepository.findByEmail(userData.email);
    if (existing) {
      throw new Error(`El email ${userData.email} ya está registrado`);
    }
    // Encriptar password con bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(userData.password, salt);

    // Definir roleID y statusID por defecto, si no vienen
    // (por ejemplo, 1=Admin,2=Picker,3=Assigner,4=Driver, 1=Active)
    const roleID = userData.roleID || 2;   // si no especifica, un rol por defecto
    const statusID = userData.statusID || 1; // "Active" por defecto

    // Crear usuario en la BD
    const createdID = await UserRepository.createUser({
      rut: userData.rut,
      name: userData.name,
      email: userData.email,
      passwordHash,
      roleID,
      statusID
    });

    return createdID; 
  },

  loginUser: async (email, password) => {
    // Ver si el usuario existe
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new Error('Credenciales inválidas (usuario no existe)');
    }
    // Verificar password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new Error('Credenciales inválidas (password incorrecto)');
    }

    // Generar JWT con payload
    const payload = {
      rut: user.rut,           // identificador del usuario
      name: user.name,
      email: user.email,
      role: user.roleName,     // 'Admin', 'Picker', etc.
      status: user.statusName  // 'Active', 'Inactive', etc.
    };
    const token = jwt.sign(payload, SECRET_KEY, {
      expiresIn: TOKEN_EXPIRES_IN,
    });

    return { token, user: { 
      rut: user.rut, 
      name: user.name, 
      email: user.email, 
      role: user.roleName 
    }};
  }
};

module.exports = AuthService;