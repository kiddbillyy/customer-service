const bcrypt = require('bcryptjs');
const { obtenerUsuarioPorCorreo, insertarUsuario, actualizarUsuarioYPerfil } = require('../models/usuarioModels');

const crearUsuario = async (req, res) => {
  const { correo, password, activo, correoCreador } = req.body;

  // Validación de "correo"
  if (!correo) {
    return res.status(400).json({ error: 'El campo "correo" es obligatorio.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(correo)) {
    return res.status(400).json({ error: 'Debe proporcionar un correo electrónico válido.' });
  }

  // Validación de "correoCreador"
  if (!correoCreador) {
    return res.status(400).json({ error: 'El campo "correoCreador" es obligatorio.' });
  }

  if (!emailRegex.test(correoCreador)) {
    return res.status(400).json({ error: 'El campo "correoCreador" debe ser un correo electrónico válido.' });
  }

  // Validación de contraseña
  if (!password) {
    return res.status(400).json({ error: 'El campo "password" es obligatorio.' });
  }

  const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{6,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      error: 'La contraseña debe tener mínimo 6 caracteres, al menos una mayúscula, un número y un carácter especial.',
    });
  }

  // Validación de "activo"
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" es obligatorio y debe ser booleano (true o false).' });
  }

  try {
    // Verificar si el correo ya está registrado
    const usuarioExistente = await obtenerUsuarioPorCorreo(correo);

    if (usuarioExistente) {
      return res.status(400).json({ error: 'El correo ya está registrado.' });
    }

    // Hashear la contraseña
    const salt = bcrypt.genSaltSync(10);
    const hashPassword = bcrypt.hashSync(password, salt);

    // Crear el usuario
    const nuevoUsuario = await insertarUsuario(correo, hashPassword, activo, correoCreador);

    res.status(201).json({
      message: 'Usuario creado exitosamente.',
      usuarioId: nuevoUsuario.UsuarioID
    });

  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const editarUsuario = async (req, res) => {
  const usuarioId = parseInt(req.params.id, 10);
  const {
    correo,
    activo,
    nombres,
    apellidos,
    rut,
    departamentoId,
    telefono,
    correoActualizador
  } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!correo || !emailRegex.test(correo)) {
    return res.status(400).json({ error: 'Debe proporcionar un correo electrónico válido.' });
  }

  if (!correoActualizador || !emailRegex.test(correoActualizador)) {
    return res.status(400).json({ error: 'Debe proporcionar el correo electrónico del actualizador.' });
  }

  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" debe ser booleano (true o false).' });
  }

  try {
    await actualizarUsuarioYPerfil(
      usuarioId,
      { correo, activo },
      { nombres, apellidos, rut, departamentoId, telefono },
      correoActualizador
    );

    res.status(200).json({ message: 'Usuario y perfil actualizados correctamente.' });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};


module.exports = {
  crearUsuario, editarUsuario
};
