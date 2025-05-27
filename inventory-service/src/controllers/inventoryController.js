const InventoryService = require("../services/inventoryService");

exports.getAll = async (req, res) => {
  try {
    const result = await InventoryService.getAll();
    
    if (!result) {
      return res.status(404).json({ message: "No se encontraron resultados" });
    }
    res.json( result );

  } catch (error) {
    console.error("❌ Error obteniendo los almacenes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getAllProducts = async (req, res) => {
  const {
    sku,
    id_almacen,
    nombre,
    status,
    page = 1
  } = req.query;

  try {
    const result = await InventoryService.getAllProducts(
      { sku, id_almacen, nombre, status },
      Number(page)
    );

    if (!result.data.length) {
      return res.status(404).json({ message: 'No se encontraron resultados' });
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error obteniendo productos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};