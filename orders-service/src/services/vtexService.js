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

exports.setOrderStartHandling = async (orderId) => {
  const url = `https://mimbralb2c.vtexcommercestable.com.br/api/oms/pvt/orders/${orderId}/start-handling`;

  try {
    const { status } = await axios.post(
      url,
      null, // sin body
      {
        headers: {
          "X-VTEX-API-AppKey"  : process.env.VTEX_APP_KEY,
          "X-VTEX-API-AppToken": process.env.VTEX_APP_TOKEN,
        },
        timeout: 10_000,
      }
    );

    console.log(`🚀 VTEX ${orderId} → start-handling (HTTP ${status})`);
    return true;
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`ℹ️ VTEX ${orderId} ya estaba en start-handling (409)`);
      return true;
    }

    const msg = JSON.stringify(err.response?.data || err.message);
    console.error("❌ Error cambiando estado VTEX:", msg);
    throw err;
  }
};

exports.sendInvoiceToVtex = async ({
  orderId,
  invoiceNumber,
  issuanceDate,
  invoiceValue,
  items
}) => {
  const url = `${VTEX_BASE_URL}/api/oms/pvt/orders/${orderId}/invoice`;

  const payload = {
    type: "Output",
    issuanceDate,
    invoiceNumber,
    invoiceValue,
    invoiceKey       : null,
    invoiceUrl       : null,
    embeddedInvoice  : null,
    courier          : "",
    trackingNumber   : "",
    trackingUrl      : "",
    dispatchedDate   : null,
    items: items.map(it => ({
      id       : String(it.id),
      price    : it.price,
      quantity : it.quantity,
      description: it.description ?? undefined
    }))
  };

  try {
    const { status } = await axios.post(url, payload, {
      headers: {
        "X-VTEX-API-AppKey"  : process.env.VTEX_APP_KEY,
        "X-VTEX-API-AppToken": process.env.VTEX_APP_TOKEN
      },
      timeout: 10_000
    });

    console.log(`🧾 VTEX invoice OK (order ${orderId}, HTTP ${status})`);
    return true;
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`ℹ️ VTEX invoice ya enviado (409) – order ${orderId}`);
      return true;
    }
    throw err;
  }
};