// // src/services/vtexService.js
// const axios = require("axios");

// exports.fetchVtexOrder = async (orderId) => {
//   const url = `https://mimbralb2c.vtexcommercestable.com.br/api/checkout/pub/orders/${orderId}`;
//   const { data } = await axios.get(url, {
//     headers: {
//       "X-VTEX-API-AppKey"  : process.env.VTEX_APP_KEY,
//       "X-VTEX-API-AppToken": process.env.VTEX_APP_TOKEN,
//       Accept               : "application/json"
//     },
//     timeout: 10_000
//   });
//   return data;
// };


// src/services/vtexService.js
const axios = require('axios');

const VTEX_BASE = process.env.VTEX_BASE || 'https://mimbralb2c.vtexcommercestable.com.br';
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nextDelay = (i, base=400, factor=2, cap=6000) => Math.min(cap, base * (factor ** i));
const retryAfterMs = (resp) => {
  const ra = resp?.headers?.['retry-after'];
  if (!ra) return null;
  const n = Number(ra);
  if (!Number.isNaN(n)) return n * 1000;
  const t = Date.parse(ra);
  return Number.isNaN(t) ? null : Math.max(0, t - Date.now());
};

function classifyVtexError(e) {
  const status = e?.response?.status;
  const code   = e?.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return { reason: 'TIMEOUT', status };
  if (TRANSIENT_HTTP.has(Number(status)))              return { reason: 'TRANSIENT', status };
  if (status === 404)                                  return { reason: 'NOT_FOUND', status };
  if (status === 401 || status === 403)                return { reason: 'AUTH', status };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')    return { reason: 'DNS', status };
  return { reason: 'OTHER', status };
}

/**
 * Descarga una orden de VTEX con reintentos para fallos transitorios.
 * @param {string} orderId
 * @param {{retries?: number, timeout?: number}} options
 */
exports.fetchVtexOrder = async (orderId, { retries = 4, timeout = 15000 } = {}) => {
  const url = `${VTEX_BASE.replace(/\/+$/,'')}/api/checkout/pub/orders/${orderId}`;
  let lastErr;

  for (let i = 0; i <= retries; i++) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          'X-VTEX-API-AppKey'  : process.env.VTEX_APP_KEY,
        'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
          Accept               : 'application/json',
        },
        timeout,
      });
      return data;
    } catch (e) {
      lastErr = e;
      const { reason, status } = classifyVtexError(e);

      // 404 justo después del evento suele ser consistencia eventual → reintenta mientras queden intentos
      const treat404AsTransient = status === 404 && i < retries;
      const isTransient = reason === 'TIMEOUT' || reason === 'TRANSIENT' || reason === 'DNS' || treat404AsTransient;

      console.warn(`VTEX fetch fallo (try ${i+1}/${retries+1})`, {
        orderId, reason, status, code: e?.code, msg: e?.response?.data || e.message
      });

      if (!isTransient || i === retries) break;

      const ra = retryAfterMs(e?.response);
      await sleep(ra != null ? Math.min(ra, 15000) : nextDelay(i));
    }
  }

  throw lastErr;
};
