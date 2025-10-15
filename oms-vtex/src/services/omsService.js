const axios = require('axios');
const http  = require('http');
const https = require('https');
const PQueue = require('p-queue').default;

const OMS_POST_URL     = process.env.OMS_POST_URL;              
const OMS_TIMEOUT_MS   = Number(process.env.OMS_TIMEOUT_MS ?? 15000);
const OMS_MAX_CONC     = Number(process.env.OMS_MAX_CONCURRENCY ?? 7);
const OMS_MIN_MS_RAW = process.env.OMS_MIN_MS;   
const OMS_MIN_MS = OMS_MIN_MS_RAW === undefined || OMS_MIN_MS_RAW === ''
  ? 0
  : Number(OMS_MIN_MS_RAW);

if (!OMS_POST_URL) throw new Error('OMS_POST_URL no configurado');

//const httpAgent  = new http.Agent({  keepAlive: true, keepAliveMsecs: 20000, maxSockets: 200, maxFreeSockets: 50 });
const httpAgent  = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 200,
  maxFreeSockets: 8,
  // 🔧 cerrar sockets libres antes que cualquier upstream (conservador)
  freeSocketTimeout: 2_000,          // << más corto que cualquier idle upstream
  // 🔧 evitar sockets “ancianos” aunque estén activos (Node >=18)
  socketActiveTTL: 30_000,
  scheduling: 'lifo', 
  noDelay: true,
});


//const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 20000, maxSockets: 200, maxFreeSockets: 50 });
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 200,
  maxFreeSockets: 50,
  freeSocketTimeout: 2_000,
  socketActiveTTL: 30_000,
  scheduling: 'lifo',
  maxCachedSessions: 0
});

const client = axios.create({
  baseURL: OMS_POST_URL.replace(/\/+$/,'').replace(/\/orders$/,''),
  timeout: OMS_TIMEOUT_MS,
  httpAgent, httpsAgent,
});

// Cola para limitar concurrencia hacia el OMS
const queueOpts = { concurrency: OMS_MAX_CONC };
if (OMS_MIN_MS > 0) {
  queueOpts.intervalCap = 1;           // 1 inicio por intervalo
  queueOpts.interval = OMS_MIN_MS;     // N ms entre inicios
}

const queue = new PQueue(queueOpts);

// Helpers
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isNetworkTransient(err) {
  return ['ECONNABORTED','ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENOTFOUND','EPIPE','EPROTO']
    .includes(err?.code);
}


function shouldRetry(status) {
  return [408, 429, 500, 502, 503, 504].includes(Number(status));
}

function nextDelay(attempt, base=300, factor=2, cap=8000) {
  const exp = Math.min(cap, base * (factor ** attempt));
  const jitter = exp * (0.5 + Math.random()*0.5); // jitter [50%,100%]
  return Math.round(jitter);
}

// Respeta Retry-After si viene
function parseRetryAfter(resp) {
  const ra = resp?.headers?.['retry-after'];
  if (!ra) return null;
  const n = Number(ra);
  if (!Number.isNaN(n)) return n * 1000;
  const t = Date.parse(ra);
  return Number.isNaN(t) ? null : Math.max(0, t - Date.now());
}
async function omsPreflight() {
  try {
    // ideal: endpoint de salud
    await client.get('/health', { timeout: 3000 });
    console.log('[OMS] health ok (GET /health)');
  } catch (e1) {
    try {
      // fallback: no crea recursos
      await client.head('/orders', { timeout: 3000 });
      console.log('[OMS] health ok (HEAD /orders)');
    } catch (e2) {
      console.warn('[OMS] health check falló:',
        e2.code, e2.response?.status, e2.message);
    }
  }
}


// API
async function postOrderToOms(payload) {
  const MAX_RETRIES = Number(process.env.OMS_MAX_RETRIES ?? 4);
  let lastErr;

  const startAll = Date.now();
  for (let i = 0; i <= MAX_RETRIES; i++) {
    const attemptStart = Date.now();
    try {
      const result = await queue.add(() =>
        client.post('/orders', payload, { headers: { 'Content-Type': 'application/json' } })
      );
      
      const dur = Date.now() - attemptStart;
      console.log('[OMS] POST ok', { status: result.status, durationMs: dur });
      return result.data ?? result;
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;
      const networkTransient = isNetworkTransient(e);
      const retriable = networkTransient || shouldRetry(status);

      const dur = Date.now() - attemptStart;
      console.warn('[OMS] POST fail', {
        status,
        code: e?.code,
        retriable,
        attempt: i+1,
        durationMs: dur,
        msg: e?.response?.data?.message || e.message
      });

      if (!retriable || i === MAX_RETRIES) break;

      const raMs = parseRetryAfter(e?.response);
      const delay = raMs != null ? Math.min(raMs, 15000) : nextDelay(i);

      await sleep(delay);
    }
  }

  console.error('[OMS] POST giving up', { totalDurationMs: Date.now() - startAll });
  throw lastErr;
}

module.exports = { postOrderToOms, omsPreflight };
