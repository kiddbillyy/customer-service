// src/clients/ordersClient.js
const axios = require("axios");

//const BASE_URL = process.env.ORDERS_API_BASE || "http://localhost:5000/api";
const BASE_URL = process.env.ORDERS_API_BASE || "http://localhost:8080/api";
async function getOrderById(orderID) {
  const { data } = await axios.get(`${BASE_URL}/orders/${orderID}`);
  return data;                         // { orderID, docentry, ... }
}

module.exports = { getOrderById };
