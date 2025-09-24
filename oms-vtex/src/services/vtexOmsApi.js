// // services/vtexOmsApi.js
// const axios = require('axios');
// const VTEX_BASE = process.env.VTEX_BASE;

// const client = axios.create({
//   baseURL: VTEX_BASE,
//   timeout: 10_000,
//   headers: {
//     'X-VTEX-API-AppKey'  : process.env.VTEX_APP_KEY,
//     'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
//   },
// });

// async function setOrderStartHandling(orderId) {
//   const url = `/api/oms/pvt/orders/${orderId}/start-handling`;
//   try {
//     const { status } = await client.post(url, null);
//     console.log(`🚀 VTEX ${orderId} → start-handling (HTTP ${status})`);
//     return true;
//   } catch (err) {
//     if (err.response?.status === 409) {
//       console.log(`ℹ️ VTEX ${orderId} ya estaba en start-handling (409)`);
//       return true;
//     }
//     const msg = JSON.stringify(err.response?.data || err.message);
//     console.error('❌ Error cambiando estado VTEX:', msg);
//     throw err;
//   }
// }


// module.exports = { setOrderStartHandling };

// services/vtexOmsApi.js
const axios = require('axios');

const VTEX_BASE = process.env.VTEX_BASE || 'https://example.vtexcommercestable.com.br';
const DRY_RUN   = String(process.env.VTEX_DRY_RUN || 'false').toLowerCase() === 'true';
const DRY_CODE  = Number(process.env.VTEX_DRY_RUN_CODE || 200); // 200 o 409 para simular

const client = axios.create({
  baseURL: VTEX_BASE,
  timeout: 10_000,
  headers: {
    'X-VTEX-API-AppKey'  : process.env.VTEX_APP_KEY,
    'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
  },
});

// redactor para no imprimir credenciales en logs
function redact(h) {
  const out = { ...h };
  if (out['X-VTEX-API-AppKey'])   out['X-VTEX-API-AppKey'] = '***';
  if (out['X-VTEX-API-AppToken']) out['X-VTEX-API-AppToken'] = '***';
  return out;
}

async function setOrderStartHandling(orderId) {
  const url = `/api/oms/pvt/orders/${orderId}/start-handling`;

  // ---- DRY RUN: no llama a VTEX, solo loguea lo que se enviaría
  if (DRY_RUN) {
    console.log(`[DRY-RUN] POST ${VTEX_BASE}${url}`);
    console.log('[DRY-RUN] headers:', redact(client.defaults.headers.common || {}));
    console.log('[DRY-RUN] body   : null');
    if (DRY_CODE === 409) {
      console.log(`ℹ️ [DRY-RUN] VTEX ${orderId} ya estaba en start-handling (409 simulado)`);
      return true;
    }
    console.log(`🚀 [DRY-RUN] VTEX ${orderId} → start-handling (HTTP ${DRY_CODE})`);
    return true;
  }

  try {
    const { status } = await client.post(url, null);
    console.log(`🚀 VTEX ${orderId} → start-handling (HTTP ${status})`);
    return true;
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`ℹ️ VTEX ${orderId} ya estaba en start-handling (409)`);
      return true;
    }
    const msg = JSON.stringify(err.response?.data || err.message);
    console.error('❌ Error cambiando estado VTEX:', msg);
    throw err;
  }
}

module.exports = { setOrderStartHandling };



