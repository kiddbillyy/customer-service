const Departamentos = require('../models/DepartmentsModels');

async function getDepartamentos(req, res) {
  try {
    // Filtro opcional: ?activos=true
    const soloActivos = String(req.query.activos || '').toLowerCase() === 'true';

    // Filtro opcional: ?buscar=nombre parcial
    const buscar = typeof req.query.buscar === 'string'
      ? req.query.buscar.trim()
      : null;

    const data = await Departamentos.findAll({
      soloActivos,
      buscar: buscar || null,
    });

    return res.status(200).json({
      ok: true,
      total: data.length,
      data
    });

  } catch (err) {
    console.error('getDepartamentos error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error obteniendo departamentos'
    });
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

      return res.status(200).json({
        ok: true,
        message: 'Departamento creado correctamente'
      });

  } catch (err) {
    const num = err?.number || err?.originalError?.info?.number;
    if (num === 2601 || num === 2627) {
      return res.status(409).json({ ok: false, message: 'Ya existe un departamento con ese nombre' });
    }

    console.error('createDepartamento error:', err);
    return res.status(500).json({ ok: false, message: 'Error creando departamento' });
  }
}
async function updateDepartamento(req, res) {
  try {
    const departamentoId = parseInt(req.params.departamentoId, 10);

    // Validación del ID
    if (isNaN(departamentoId)) {
      return res.status(400).json({ ok: false, message: 'ID de departamento inválido' });
    }

    const {
      nombre,
      descripcion = null,
      contacto = null,
      estado = 1,
      usuarioActualizador
    } = req.body || {};

    // Validaciones adicionales
    if (!usuarioActualizador || typeof usuarioActualizador !== 'number') {
      return res.status(400).json({
        ok: false,
        message: 'El ID del usuario actualizador es obligatorio y debe ser numérico'
      });
    }

    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({
        ok: false,
        message: 'El nombre es obligatorio y no puede estar vacío'
      });
    }

    // Llamar al modelo
    const updatedRow = await Departamentos.update({
      departamentoId,
      nombre: nombre.trim(),
      descripcion,
      contacto,
      estado,
      usuarioActualizador
    });

    if (!updatedRow) {
      return res.status(404).json({
        ok: false,
        message: 'Departamento no encontrado'
      });
    }

  return res.status(200).json({
    ok: true,
    message: 'Departamento actualizado correctamente'
  });

  } catch (error) {
    console.error('updateDepartamento error:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error actualizando departamento'
    });
  }
}

module.exports = { getDepartamentos, createDepartamento, updateDepartamento };
