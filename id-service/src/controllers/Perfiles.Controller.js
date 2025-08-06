const { editarPerfilUsuario, getPerfilPorUsuarioId, actualizarUrlImagenPerfil } = require('../models/PerfilesModels');
const fs  = require('fs');
const cloudinary = require('../config/cloudinary');

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

const obtenerPerfilPorUsuarioId = async (req, res) => {
  const { usuarioId } = req.params;

  try {
    const perfil = await getPerfilPorUsuarioId(usuarioId);

    if (!perfil) {
      return res.status(404).json({ mensaje: 'Perfil no encontrado' });
    }

    res.json(perfil);
  } catch (error) {
    console.error('Error al obtener el perfil:', error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
};

const subirImagenPerfil = async (req, res) => {
  const { usuarioId } = req.params;

  if (!usuarioId || isNaN(parseInt(usuarioId))) {
    return res.status(400).json({ mensaje: 'UsuarioID inválido' });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'No se recibió una imagen' });
    }

    // 🔁 Subir con nombre fijo a carpeta personalizada
    const resultado = await cloudinary.uploader.upload(req.file.path, {
      folder: `perfiles/${usuarioId}`,          
      public_id: 'foto_perfil',                 
      use_filename: true,
      unique_filename: false,
      overwrite: true                           
    });

    //  Eliminar archivo temporal
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.warn('No se pudo eliminar el archivo temporal:', err.message);
    }

    //  Guardar la URL final en la base de datos
    await actualizarUrlImagenPerfil(usuarioId, resultado.secure_url);

    const perfilActualizado = await getPerfilPorUsuarioId(usuarioId);

    res.status(200).json({
      mensaje: 'Imagen subida correctamente',
      url: resultado.secure_url,
      perfil: perfilActualizado
    });

  } catch (error) {
    console.error('Error al subir imagen:', error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
};



module.exports = {
  editarPerfil, obtenerPerfilPorUsuarioId, subirImagenPerfil
};
