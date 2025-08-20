const InventoryRepository = require("../models/inventoryRepository");

const InventoryService = {
  getAll: async () => {
    return InventoryRepository.getAll();
  },

  getAllProducts: async (filters, page) => {
    return InventoryRepository.getAllProducts(filters, page);
  },

  getBySku: async (sku) => {
    // 1) Info base del producto
    const product = await InventoryRepository.getProductBySku(sku);
    if (!product) return null;

    // 2) Stock por almacén (ordenado por prioridad asc)
    const inventories = await InventoryRepository.getInventoriesBySku(sku);

    // 3) Totales útiles
    const totalDisponible = inventories.reduce((acc, i) => acc + (i.disponible || 0), 0);

    return {
      ...product,
      totalDisponible,
      almacenes: inventories
    };
  },

  findStockForProducts: async (products) => {
    const results = [];

    for (const product of products) {
      const { sku, quantity } = product;

      // solo almacenes con prioridad (no NULL)
      const { data: inventories } = await InventoryRepository.getInventoriesWithPriorityOnly(sku);

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

module.exports = InventoryService;
