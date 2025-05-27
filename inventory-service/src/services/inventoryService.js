const InventoryRepository = require("../models/inventoryRepository");

const InventorySerive = {
  getAll: async () => {
    const result = await InventoryRepository.getAll();
    return result;
  },
    getAllProducts: async (filters, page) => {
    const result = await InventoryRepository.getAllProducts(filters, page);
    return result;
  }
};

module.exports = InventorySerive;
