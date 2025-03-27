const axios = require("axios");

const PICKING_BASE_URL = process.env.PICKING_SERVICE_URL || "http://192.168.0.83:5001/api/picking";

const pickingServiceClient = {
  fetchOrderProductDetails: async (orderProductIDs) => {
    if (!orderProductIDs || orderProductIDs.length === 0) {
      // No hay IDs para consultar, se retorna un arreglo vacío
      return [];
    }
    const idsParam = orderProductIDs.join(",");
    const url = `${PICKING_BASE_URL}/order-products/bulk?ids=${idsParam}`;
    const { data } = await axios.get(url);
    return data;
  },
};

module.exports = pickingServiceClient;
