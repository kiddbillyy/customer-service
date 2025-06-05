// src/clients/ordersClient.js
const axios = require("axios");

const BASE_URL = process.env.ORDERS_API_BASE || "http://192.168.0.164:5000/api";

async function getOrderById(orderID) {
  const { data } = await axios.get(`${BASE_URL}/orders/${orderID}`);
  return data;                         // { orderID, docentry, ... }
}

module.exports = { getOrderById };
