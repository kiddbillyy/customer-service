const { insertarPlataforma, getPlataformas, actualizarPlataforma } = require('../models/PlataformasModels');

const crearPlataforma = async (req, res) => {
  const { nombre, codigo, descripcion } = req.body;

  if (!nombre || !codigo || !descripcion) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }

  try {
    const nuevaPlataforma = await insertarPlataforma(nombre, codigo, descripcion);
    res.status(201).json({
      message: 'Plataforma creada exitosamente.',
      data: nuevaPlataforma,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error del servidor al crear la plataforma.',
      error: error.message,
    });
  }
};

async function listarPlataformas(req, res) {
  try {
    const plataformas = await getPlataformas();
    res.status(200).json({ ok: true, total: plataformas.length, data: plataformas });
  } catch (error) {
    console.error('Error al obtener plataformas:', error);
    res.status(500).json({ ok: false, message: 'Error interno del servidor' });
  }
}

async function editarPlataforma(req, res) {
  const plataformaId = parseInt(req.params.id, 10);
  const { nombre, descripcion } = req.body;

  if (!plataformaId || isNaN(plataformaId)) {
    return res.status(400).json({ ok: false, message: 'ID de plataforma inválido' });
  }

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return res.status(400).json({ ok: false, message: 'El nombre es obligatorio' });
  }

  try {
    const plataforma = await actualizarPlataforma({
      id: plataformaId,
      nombre: nombre.trim(),
      descripcion
    });

    if (!plataforma) {
      return res.status(404).json({ ok: false, message: 'Plataforma no encontrada' });
    }

    res.status(200).json({ ok: true, message: 'Plataforma actualizada correctamente', data: plataforma });
  } catch (err) {
    console.error('Error al actualizar plataforma:', err);
    res.status(500).json({ ok: false, message: 'Error interno del servidor' });
  }
}
module.exports = { crearPlataforma, listarPlataformas, editarPlataforma};
