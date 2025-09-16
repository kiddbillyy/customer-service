const axios = require("axios");

const baseURL = process.env.OMS_SERVICE_BASE_URL; 

async function getOrder(orderId) {
  const { data } = await axios.get(`${baseURL}/orders/${encodeURIComponent(orderId)}`, {
    timeout: 15000
  });
  return data; // Debe incluir: items, valuesInCents, customer.cardCode, payments, etc.
}

module.exports = { getOrder };
