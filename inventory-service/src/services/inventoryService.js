const InventoryRepository = require("../models/inventoryRepository");

const InventorySerive = {
  getAll: async () => {
    const result = await InventoryRepository.getAll();
    return result;
  },
    getAllProducts: async (filters, page) => {
    const result = await InventoryRepository.getAllProducts(filters, page);
    return result;
  },
 findStockForProducts: async (products) => {
  const results = [];

  for (const product of products) {
    const { sku, quantity } = product;

    // Obtener solo inventario de almacenes con prioridad (no NULL)
    const { data: inventories } = await InventoryRepository.getInventoriesWithPriorityOnly(sku);

    // Ordenar por prioridad ascendente
    const sorted = inventories
      .filter(inv => inv.disponible > 0 && inv.prioridad !== null)
      .sort((a, b) => a.prioridad - b.prioridad);

    let remaining = quantity;
    const usedWarehouses = [];

    for (const inv of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, inv.disponible);
      usedWarehouses.push({
        id_almacen: inv.id_almacen,
        nombre: inv.nombre,
        quantity: take,
        prioridad: inv.prioridad
      });
      remaining -= take;
    }

    results.push({
      sku,
      quantity,
      assignedWarehouses: usedWarehouses,
      stockSufficient: remaining <= 0,
      missingQuantity: remaining > 0 ? remaining : 0,
      fallbackUsed: usedWarehouses.length > 0 && usedWarehouses[0].prioridad !== 1
    });
  }

  return results;
}
  
};

module.exports = InventorySerive;
