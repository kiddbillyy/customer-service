const Departamentos = require('../models/DepartmentsModels');

async function getDepartamentos(req, res) {
  try {
    const soloActivos = String(req.query.activos || '').toLowerCase() === 'true';
    const buscar = (req.query.buscar ?? '').toString().trim(); // ← nuevo

    const data = await Departamentos.findAll({
      soloActivos,
      buscar: buscar || null, 
    });

    res.json({ ok: true, total: data.length, data });
  } catch (err) {
    console.error('getDepartamentos error:', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo departamentos' });
  }
}


async function createDepartamento(req, res) {
    console.log("inicio de post")
  try {
    console.log('[createDepartamento] body:', req.body);
    const {
      nombre,
      descripcion = null,
      contacto = null,
      estado = 1,
      email,                 
    } = req.body || {};

    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ ok: false, message: 'El nombre es obligatorio' });
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ ok: false, message: 'El email es obligatorio' });
    }
    console.log('[createDepartamento] buscando UsuarioID por email:', email);
    // 1) Resolver el id del usuario por email
    const usuarioId = await Departamentos.findUserIdByEmail(email.trim());
    console.log('[createDepartamento] UsuarioID encontrado:', usuarioId);
    if (!usuarioId) {
      return res.status(404).json({ ok: false, message: 'No se encontró un usuario con ese email' });
    }

    // 2) Crear con UsuarioCreador = usuarioId
    console.log('[createDepartamento] insertando departamento...');
    const row = await Departamentos.create({
      nombre: nombre.trim(),
      descripcion,
      contacto,
      estado,
      usuarioCreador: Number(usuarioId),
    });
    console.log('[createDepartamento] insert OK, DepartmentId:', row?.DepartamentoID);

    return res.status(201).json({ ok: true, data: row });
  } catch (err) {
    const num = err?.number || err?.originalError?.info?.number;
    if (num === 2601 || num === 2627) {
      return res.status(409).json({ ok: false, message: 'Ya existe un departamento con ese nombre' });
    }
    console.error('createDepartamento error:', err);
    return res.status(500).json({ ok: false, message: 'Error creando departamento' });
  }
}

module.exports = { getDepartamentos, createDepartamento };
