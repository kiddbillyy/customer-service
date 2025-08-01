const { insertarPlataforma } = require('../models/PlataformasModels');

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

module.exports = { crearPlataforma, };
