// services/financeService.js
const axios = require('axios');
const http  = require('http');
const https = require('https');
const PQueue = require('p-queue').default;

const FINANCE_BASE_URL = process.env.FINANCE_BASE_URL; // ej: https://finance.internal/api
const FINANCE_TIMEOUT  = Number(process.env.FINANCE_TIMEOUT_MS ?? 15000);
const FINANCE_CONC     = Number(process.env.FINANCE_MAX_CONCURRENCY ?? 5);

if (!FINANCE_BASE_URL) throw new Error('FINANCE_BASE_URL no configurado');

const httpAgent  = new http.Agent({  keepAlive: true, keepAliveMsecs: 20000, maxSockets: 200, maxFreeSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 20000, maxSockets: 200, maxFreeSockets: 50 });

const client = axios.create({
  baseURL: FINANCE_BASE_URL.replace(/\/+$/,''),
  timeout: FINANCE_TIMEOUT,
  httpAgent, httpsAgent,
});

const queue = new PQueue({ concurrency: FINANCE_CONC });

const RETRIABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isNetworkTransient(err) {
  return ['ECONNABORTED','ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENOTFOUND','EPIPE','EPROTO']
    .includes(err?.code);
}

function nextDelay(attempt, base=300, factor=2, cap=8000) {
  const exp = Math.min(cap, base * (factor ** attempt));
  const jitter = exp * (0.5 + Math.random()*0.5);
  return Math.round(jitter);
}

async function postPaymentToFinance(payload) {
  const MAX_RETRIES = Number(process.env.FINANCE_MAX_RETRIES ?? 4);
  let lastErr;

  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      const res = await queue.add(() =>
        client.post('/finance/payments', payload, { headers: { 'Content-Type': 'application/json' } })
      );
      return res.data ?? res;
    } catch (e) {
      console.log("Intento N ° ",i)
      lastErr = e;
      const status = e?.response?.status;
      const retriable = isNetworkTransient(e) || RETRIABLE_HTTP.has(Number(status));
      if (!retriable || i === MAX_RETRIES) break;
      await sleep(nextDelay(i));
    }
  }
  throw lastErr;
}


module.exports = { postPaymentToFinance };
