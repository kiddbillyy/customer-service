const bcrypt = require('bcryptjs');
const { obtenerUsuarioPorCorreo, insertarUsuario, actualizarUsuarioYPerfil, getUsuarios } = require('../models/usuarioModels');
const { verificarRutExistente } = require('../utils/verificarRutExistente');

const { userHasSellerRole, getUsuarioDatosBasicos } = require('../models/rolesModels');
const { emitSellerCreated } = require('../services/events/userEvents');

const crearUsuario = async (req, res) => {
  const {
    correo,
    password,
    activo,
    usuarioCreadorId,
    // Datos opcionales del perfil
    nombres,
    apellidos,
    rut,
    departamentoId,
    telefono,
    urlImagenPerfil,
    // Opcionales
    rolId,
    plataformaIds = [] 
  } = req.body;

  // Validación básica de correo
  if (!correo || typeof correo !== 'string' || !correo.trim()) {
    return res.status(400).json({ error: 'El campo "correo" es obligatorio y debe ser un string.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(correo)) {
    return res.status(400).json({ error: 'Debe proporcionar un correo electrónico válido.' });
  }

  // Validación de usuarioCreadorId
  if (!usuarioCreadorId || typeof usuarioCreadorId !== 'number') {
    return res.status(400).json({ error: 'El campo "usuarioCreadorId" es obligatorio y debe ser numérico.' });
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

  // Validación de estado
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" es obligatorio y debe ser booleano (true o false).' });
  }

  // Validación opcional de rol
  if (rolId !== undefined && typeof rolId !== 'number') {
    return res.status(400).json({ error: 'El campo "rolId" debe ser numérico si se proporciona.' });
  }

  // Validación de plataformaIds
  if (!Array.isArray(plataformaIds) || plataformaIds.some(id => typeof id !== 'number')) {
    return res.status(400).json({ error: 'El campo "plataformaIds" debe ser un arreglo de números.' });
  }

  try {
    // Validar correo duplicado
    const usuarioExistente = await obtenerUsuarioPorCorreo(correo);
    if (usuarioExistente) {
      return res.status(400).json({ error: 'El correo ya está registrado.' });
    }

    // Validar RUT duplicado si se proporciona
    if (rut) {
      const rutDuplicado = await verificarRutExistente(rut);
      if (rutDuplicado) {
        return res.status(409).json({ error: 'El RUT ya está registrado en otro perfil.' });
      }
    }

    // Encriptar contraseña
    const salt = bcrypt.genSaltSync(10);
    const hashPassword = bcrypt.hashSync(password, salt);

    // Armar datos de perfil
    const perfil = {
      nombres,
      apellidos,
      rut,
      departamentoId,
      telefono,
      urlImagenPerfil
    };

    // Insertar usuario con perfil, rol y plataformas
    const nuevoUsuario = await insertarUsuario(
      correo,
      hashPassword,
      activo,
      usuarioCreadorId,
      perfil,
      rolId,
      plataformaIds 
    );

    const usuarioId = nuevoUsuario.UsuarioID;

    // 2) ¿Quedó con algún rol que contenga "VENDEDOR"?
    const esVendedor = await userHasSellerRole(usuarioId);

    // 3) Si es vendedor => publicamos evento a Kafka
    if (esVendedor) {
      try {
        const datos = await getUsuarioDatosBasicos(usuarioId);
        if (datos) {
          await emitSellerCreated(datos); 
          // { usuarioId, correoElectronico, nombres, apellidos, rut, telefono }
        }
      } catch (e) {
        console.error('Error publicando seller.created:', e);
        // Decisión de negocio: no romper la creación del usuario si falla Kafka
      }
    }
    // Respuesta exitosa
    res.status(201).json({
      message: 'Usuario creado exitosamente.',
      usuarioId: nuevoUsuario.UsuarioID
    });

  } catch (error) {
    console.error('Error al crear usuario:', error);
    const num = error?.number || error?.originalError?.info?.number;

    if (num === 2601 || num === 2627) {
      return res.status(409).json({ error: 'Datos duplicados. Verifica correo o RUT.' });
    }

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
    urlImagenPerfil,
    usuarioActualizadorId,
    rolId,
    plataformaIds
  } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!correo || !emailRegex.test(correo)) {
    return res.status(400).json({ error: 'Debe proporcionar un correo electrónico válido.' });
  }

  if (!usuarioActualizadorId || typeof usuarioActualizadorId !== 'number') {
    return res.status(400).json({ error: 'Debe proporcionar el ID del usuario actualizador como número.' });
  }

  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" debe ser booleano (true o false).' });
  }

  if (rolId !== undefined && typeof rolId !== 'number') {
    return res.status(400).json({ error: 'El campo "rolId" debe ser numérico si se proporciona.' });
  }

  if (plataformaIds !== undefined && !Array.isArray(plataformaIds)) {
    return res.status(400).json({ error: 'El campo "plataformaIds" debe ser un arreglo si se proporciona.' });
  }

  try {
    await actualizarUsuarioYPerfil(
      usuarioId,
      { correo, activo },
      { nombres, apellidos, rut, departamentoId, telefono, urlImagenPerfil },
      usuarioActualizadorId,
      rolId,
      plataformaIds
    );

    res.status(200).json({ message: 'Usuario y perfil actualizados correctamente.' });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);

    const num = error?.number || error?.originalError?.info?.number;
    if (num === 2601 || num === 2627) {
      return res.status(409).json({ error: 'Datos duplicados. Verifica correo o RUT.' });
    }

    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
function normalizeUserQuery(qr) {
  const q = Object.fromEntries(
    Object.entries(qr).map(([k, v]) => [k.toLowerCase(), v])
  );

  return {
    page:     parseInt(q.page)     || 1,
    pageSize: parseInt(q.pagesize) || 50,

    document:  q.document   ?? null,
    firstname: q.firstname  ?? null,
    lastname:  q.lastname   ?? null,
    email:     q.email      ?? null,

    _raw: q
  };
}

// Controller: GET /usuarios
async function listarUsuarios(req, res) {
  const opts = normalizeUserQuery(req.query);

  // Validación de paginación
  if (opts.page < 1 || opts.pageSize < 1 || opts.pageSize > 500) {
    return res.status(400).json({
      message: 'Parámetros de paginación inválidos. "page" y "pageSize" deben ser positivos, y pageSize ≤ 500.'
    });
  }

  try {
    const resultado = await getUsuarios(opts);
    return res.status(200).json(resultado);
  } catch (error) {
    console.error('❌ Error al listar usuarios:', error);
    return res.status(500).json({
      message: 'Error interno del servidor al obtener usuarios.'
    });
  }
}

module.exports = {
  crearUsuario, editarUsuario, listarUsuarios
};
