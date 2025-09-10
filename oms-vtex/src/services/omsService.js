const axios = require('axios');

const OMS_POST_URL = process.env.OMS_POST_URL || 'https://catalogomimbral.loclx.io/api/oms-service/orders';

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
const RETRIABLE = [429, 502, 503, 504];


exports.postOrderToOms = async (payload) => {
  const MAX = 4;
  let lastErr;

  for (let i = 0; i < MAX; i++) {
    try {
      const { data } = await axios.post(OMS_POST_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      return data;
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;
      if (!RETRIABLE.includes(status)) throw e;
      const delay = Math.min(500 * 2 ** i, 4000);
      console.warn(` postOrderToOms retry ${i+1}/${MAX} en ${delay}ms (status ${status})`);
      await sleep(delay);
    }
  }
  throw lastErr;
};
