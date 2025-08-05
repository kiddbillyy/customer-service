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
  console.log("inicio de post");

  try {
    const {
      nombre,
      descripcion = null,
      contacto = null,
      estado = 1,
      usuarioCreador,
    } = req.body || {};

    // Validaciones
    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ ok: false, message: 'El nombre es obligatorio' });
    }

    if (!usuarioCreador || typeof usuarioCreador !== 'number') {
      return res.status(400).json({ ok: false, message: 'El ID del usuario creador es obligatorio y debe ser numérico' });
    }

    console.log('[createDepartamento] creando departamento con UsuarioCreador:', usuarioCreador);

    // Crear departamento
    const row = await Departamentos.create({
      nombre: nombre.trim(),
      descripcion,
      contacto,
      estado,
      usuarioCreador,
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
