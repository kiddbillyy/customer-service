const { editarPerfilUsuario } = require('../models/PerfilesModels');

const editarPerfil = async (req, res) => {
  const usuarioId = parseInt(req.params.id, 10);  
  const { nombres, apellidos, rut, telefono, urlImagenPerfil } = req.body;

  if (!usuarioId || isNaN(usuarioId)) {
    return res.status(400).json({ error: 'Debe proporcionar un ID válido en la URL.' });
  }

  try {
    await editarPerfilUsuario(usuarioId, {
      nombres,
      apellidos,
      rut,
      telefono,
      urlImagenPerfil,
    });

    res.status(200).json({ message: 'Perfil actualizado correctamente.' });
  } catch (error) {
    console.error('Error al editar perfil:', error);
    res.status(500).json({ error: 'Error al actualizar el perfil del usuario.' });
  }
};

module.exports = {
  editarPerfil,
};
