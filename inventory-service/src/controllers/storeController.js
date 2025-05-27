const StoreService = require("../services/storeService");

exports.getAll = async (req, res) => {
  try {
    const result = await StoreService.getAll();
    
    if (!result) {
      return res.status(404).json({ message: "No se encontraron resultados" });
    }
    res.json( result );

  } catch (error) {
    console.error("❌ Error obteniendo el inventario:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
