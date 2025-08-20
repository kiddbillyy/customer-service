const AuthService = require('../services/authService');

exports.register = async (req, res, next) => {
  try {
    const { rut, name, email, password, roleID, statusID } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y password son obligatorios' });
    }

    const newUserID = await AuthService.registerUser({ 
      rut, name, email, password, roleID, statusID 
    });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      rut: rut,
    });
  } catch (error) {
    console.error('Error registro usuario:', error);
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y password son obligatorios' });
    }

    const { token, user } = await AuthService.loginUser(email, password);
    res.json({ 
      message: 'Login exitoso', 
      token, 
      user 
    });
  } catch (error) {
    console.error('Error login usuario:', error);
    res.status(401).json({ message: error.message });
  }
};