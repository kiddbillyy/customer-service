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

exports.checkAvailability = async (req, res) => {
  try {
    const products = req.body.products; // [{ sku, quantity }]
    if (!Array.isArray(products)) {
      return res.status(400).json({ message: 'Formato inválido de entrada.' });
    }

    const result = await InventoryService.findStockForProducts(products);

    const insufficient = result.filter(p => !p.stockSufficient);

    if (insufficient.length > 0) {
      return res.status(422).json({
        message: 'No hay stock suficiente para uno o más productos prioritarios.',
        missing: insufficient
      });
    }

    return res.status(200).json({ data: result });
  } catch (err) {
    console.error('Error en checkAvailability:', err);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
};