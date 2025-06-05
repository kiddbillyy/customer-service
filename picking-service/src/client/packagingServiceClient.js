const axios = require("axios");

const packagingServiceClient = {
  async fetchAssignedToPicker(orderProductID, pickerRUT) {
    const baseUrl = process.env.PACKAGING_SERVICE_URL || "http://192.168.0.164:5003";
    const resp = await axios.get(`${baseUrl}/api/bundles/assigned/quantity`, {
      params: { orderProductID, pickerRUT }
    });
    return resp.data.totalInBultos; // number
  }
};

module.exports = packagingServiceClient;
