// src/infra/omsClient.js
const axios = require("axios");

const baseURL = process.env.OMS_SERVICE_BASE_URL; 

async function getOrder(u_ref1) {
  const url = `${baseURL}/orders?valuesInCents=false&u_ref1=${encodeURIComponent(u_ref1)}`;
  console.log(url);
  const { data } = await axios.get(url, { timeout: 70000 });
  console.log("data: ",data)

  const row = Array.isArray(data?.rows) ? data.rows[0] : null;
  if (!row) throw new Error(`Orden no encontrada: ${u_ref1}`);

  // Normalizamos el shape para tus mappers
  return {
    orderId: row.u_ref1,                        // referencia VTEX
    customer: { cardCode: row.customerCardCode || null },
    fulfillment: row.fulfillment || {},
    items: row.items || [],
    valuesInCents: false,                     
    doctotalsy: row.doctotalsy,
    raw: row
  };
}

module.exports = { getOrder };
