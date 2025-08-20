const UserService = require('../services/userService');

exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await UserService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
};
exports.getAllActiveUsers = async (req, res, next) => {
  try {
    const users = await UserService.getAllActiveUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.getAllPickers = async (req, res, next) => {
  try {
    const users = await UserService.getAllPickers();
    res.json(users);
  } catch (err) {
    next(err);
  }
};




exports.getUserByRut = async (req, res, next) => {
  try {
    const user = await UserService.getUserByRut(req.params.rut);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
};


exports.updateUser = async (req, res, next) => {
  try {
    const updated = await UserService.updateUser(req.params.rut, req.body);
    if (!updated) {
      return res.status(404).json({ message: 'No se pudo actualizar (usuario no encontrado)' });
    }
    res.json({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const deleted = await UserService.deleteUser(req.params.rut);
    if (!deleted) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (err) {
    next(err);
  }
};

exports.getAllRoles = async (req, res, next) => {
  try {
    const roles = await UserService.getAllRoles();
    res.json(roles);
  } catch (err) {
    next(err);
  }
};

exports.getAllStatus = async (req, res, next) => {
  try {
    const statuses = await UserService.getAllStatus();
    res.json(statuses);
  } catch (err) {
    next(err);
  }
};