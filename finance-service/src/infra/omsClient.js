// // src/infra/omsClient.js
// const axios = require("axios");

// const baseURL = process.env.OMS_SERVICE_BASE_URL; 

// async function getOrder(u_ref1) {
//   const url = `${baseURL}/orders?valuesInCents=false&u_ref1=${encodeURIComponent(u_ref1)}`;
//   console.log(url);
//   const { data } = await axios.get(url, { timeout: 70000 });
//   console.log("data: ",data)

//   const row = Array.isArray(data?.rows) ? data.rows[0] : null;
//   if (!row) throw new Error(`Orden no encontrada: ${u_ref1}`);

//   // Normalizamos el shape para tus mappers
//   return {
//     orderId: row.u_ref1,                        // referencia VTEX
//     customer: { cardCode: row.customerCardCode || null },
//     fulfillment: row.fulfillment || {},
//     items: row.items || [],
//     valuesInCents: false,                     
//     doctotalsy: row.doctotalsy,
//     raw: row
//   };
// }

// module.exports = { getOrder };

// src/infra/omsClient.js
const axios = require("axios");
const axiosRetry = require("axios-retry").default;


const baseURL = process.env.OMS_SERVICE_BASE_URL;

// Config global: 3 reintentos, backoff exponencial
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  shouldResetTimeout: true,
  retryCondition: (error) => {
    // reintenta si es timeout, 5xx o red error
    return (
      error.code === 'ECONNABORTED' ||
      error.response?.status >= 500 ||
      error.response == null
    );
  }
});

async function getOrder(u_ref1) {
  const url = `${baseURL}/orders?valuesInCents=false&u_ref1=${encodeURIComponent(u_ref1)}`;
  console.log("GET OMS:", url);

  const { data } = await axios.get(url, { timeout: 20000 }); // 20s cada intento

  const row = Array.isArray(data?.rows) ? data.rows[0] : null;
  if (!row) throw new Error(`Orden no encontrada: ${u_ref1}`);

  return {
    orderId: row.u_ref1,
    customer: { cardCode: row.customerCardCode || null },
    fulfillment: row.fulfillment || {},
    items: row.items || [],
    isReservationInvoice: !!(row.isReservationInvoice === true || row.isReservationInvoice === 1 || row.isReservationInvoice === "1"),
    seller: row.seller != null ? String(row.seller) : undefined, 
    valuesInCents: false,
    doctotalsy: row.doctotalsy,
    raw: row
  };
}

module.exports = { getOrder };
