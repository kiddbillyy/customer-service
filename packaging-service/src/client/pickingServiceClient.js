const axios = require("axios");

const PICKING_BASE_URL = process.env.PICKING_SERVICE_URL || "http://192.168.0.83:5001/api/picking";

const pickingServiceClient = {
  fetchOrderProductDetails: async (orderProductIDs) => {
    // Llamamos al endpoint que creaste en picking-service
    const idsParam = orderProductIDs.join(",");
    const url = `${PICKING_BASE_URL}/order-products/bulk?ids=${idsParam}`;
    
    const { data } = await axios.get(url);
    // data será el array con itemcode, found, not_found, repicked, pickerRUT, etc.
    return data;
  }
};

module.exports = pickingServiceClient;
