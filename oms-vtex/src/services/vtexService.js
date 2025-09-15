// src/services/vtexService.js
const axios = require("axios");

exports.fetchVtexOrder = async (orderId) => {
  const url = `https://mimbralb2c.vtexcommercestable.com.br/api/checkout/pub/orders/${orderId}`;
  const { data } = await axios.get(url, {
    headers: {
      "X-VTEX-API-AppKey"  : process.env.VTEX_APP_KEY,
      "X-VTEX-API-AppToken": process.env.VTEX_APP_TOKEN,
      Accept               : "application/json"
    },
    timeout: 10_000
  });
  return data;
};
