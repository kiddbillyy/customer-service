const StoreRepository = require("../models/storeRepository");

const StoreService = {
  getAll: async () => {
    const result = await StoreRepository.getAll();
    return result;
  }
};

module.exports = StoreService;
