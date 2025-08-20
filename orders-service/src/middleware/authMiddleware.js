const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET || 'mysupersecretkey';

module.exports = function (allowedRoles = []) {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Falta token o es inválido' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, SECRET_KEY);

      // decoded.role === 'Admin' / 'Picker' / 'Driver' / 'Assigner'
      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ message: 'No tienes permiso para esta acción' });
      }

      // Guardar datos del usuario en req.user
      req.user = decoded;
      console.log('req.user:', req.user);
      console.log(token)
      console.log(decoded)
      next();
    } catch (error) {
      console.error('Error validando token:', error);
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }
  };
};