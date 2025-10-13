/* // src/proxy/routeFactory.js
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import createBreaker from '../utils/createBreaker.js';
import auth from '../middlewares/auth.js';
import rbac from '../middlewares/rbac.js';
import http from 'node:http';

// src/proxy/routeFactory.js
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 512,
  maxFreeSockets: 8,     // ↓ menos sockets ociosos acumulados
  freeSocketTimeout: 1_000, // ← más bajo que tu intervalo típico (1.5s) y, sobre todo, que el idle del hop
  socketActiveTTL: 30_000,
  scheduling: 'lifo',     // usa primero el socket más reciente del pool (evita pescar los más viejos)
  noDelay: true, 
});


export function makeRoute({
  path,
  target,
  requireAuth = false,
  requireRbac = false,
  publicPaths = [],
  prependBasePath = true
}) {
  const breaker = createBreaker(target);
  const router = express.Router();

  if (requireAuth) {
    router.use((req, res, next) => {
      const rel = (req.originalUrl || req.url || '').replace(path, '') || '/';
      const isPublic = publicPaths.some(p => rel.startsWith(p));
      if (isPublic) return next();
      return auth(req, res, err => {
        if (err) return next(err);
        return requireRbac ? rbac(req, res, next) : next();
      });
    });
  }

  router.use(
    createProxyMiddleware({
      target,
      changeOrigin: true,
      agent: httpAgent,
      pathRewrite: prependBasePath
        ? (incomingPath) => `${path}${incomingPath}`
        : undefined,
      // timeouts alineados con el server del OMS
      timeout: 60_000,      // tiempo total de la request (cliente→gateway)
      proxyTimeout: 55_000, // inactividad del socket (gateway→upstream)

      // (Opcional) logging breve del upstream
      onProxyRes(proxyRes, req) {
        // Comentado para no ensuciar logs: descomenta si quieres observar
        // console.log('[GW-OUT]', req.method, req.originalUrl, {
        //   status: proxyRes.statusCode,
        //   server: proxyRes.headers['server'],
        //   via: proxyRes.headers['via'],
        //   xUp: proxyRes.headers['x-envoy-upstream-service-time'] || proxyRes.headers['x-response-time']
        // });
      },

      // Mapeo de errores a 504/502
      onError: (err, _req, res) => {
        console.error('[ProxyError]', {
          target,
          code: err.code,
          message: err.message,
          name: err.name
        });
        const timeoutish = err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
        if (!res.headersSent) {
          res.status(timeoutish ? 504 : 502).json({ message: 'Microservicio no disponible' });
        }
      }
    })
  );

  
  return { mountPoint: path, handler: router, breaker };
}
 */
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import createBreaker from '../utils/createBreaker.js';
import auth from '../middlewares/auth.js';
import rbac from '../middlewares/rbac.js';
import http from 'node:http';
import { logger } from '../middlewares/logger.js';

// --- Agentes: pool (keep-alive) y close (sin keep-alive)
const pooledAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 512,
  maxFreeSockets: 8,
  freeSocketTimeout: 1_000,
  socketActiveTTL: 30_000,
  scheduling: 'lifo',
  noDelay: true,
});

const closeAgent = new http.Agent({ keepAlive: false });

function pickAgent(profile) {
  switch ((profile || '').toLowerCase()) {
    case 'close':
    case 'no-keepalive':
    case 'nokeepalive':
      return closeAgent;
    default:
      return pooledAgent;
  }
}

// --- Logging control por env
const LOG_UPSTREAM = String(process.env.LOG_UPSTREAM || '').toLowerCase() === '1' ||
                     String(process.env.LOG_UPSTREAM || '').toLowerCase() === 'true';
const ONLY_PATH    = process.env.LOG_UPSTREAM_ONLY_PATH || '';
const SLOW_MS      = Number(process.env.LOG_UPSTREAM_SLOW_MS || '0');

try { logger.info('[GW-MODULE]', { file: import.meta.url }); } catch {}

function matchOnlyPath(url = '') {
  return !ONLY_PATH || url.startsWith(ONLY_PATH);
}

// --- wrapper con retry para errores transitorios GET
function makeProxyWithRetry(opts) {
  let proxy;
  const origOnError = opts.onError;
  proxy = createProxyMiddleware({
    ...opts,
    onError: (err, req, res, ...rest) => {
      const retryable =
        !req.__retried &&
        req.method === 'GET' &&
        (err?.code === 'ECONNRESET' || err?.code === 'EPIPE' || /socket hang up/i.test(err?.message || ''));

      if (retryable && !res.headersSent) {
        req.__retried = true;
        req.headers['x-retry'] = '1';
        return setImmediate(() => proxy(req, res));
      }
      return origOnError ? origOnError(err, req, res, ...rest) : res.end();
    },
  });
  return proxy;
}

export function makeRoute({
  path,
  target,
  requireAuth = false,
  requireRbac = false,
  publicPaths = [],
  prependBasePath = true,
  agentProfile = 'pooled',          // ← perfil de agente
}) {
  logger.info('[GW-ROUTE]', { path, target, requireAuth, requireRbac, prependBasePath, agentProfile });

  const breaker = createBreaker(target);
  const router = express.Router();

  // Auth + RBAC
  if (requireAuth) {
    router.use((req, res, next) => {
      const rel = (req.originalUrl || req.url || '').replace(path, '') || '/';
      const isPublic = publicPaths.some((p) => rel.startsWith(p));
      if (isPublic) return next();
      return auth(req, res, (err) => (err ? next(err) : (requireRbac ? rbac(req, res, next) : next())));
    });
  }

  const agent = pickAgent(agentProfile);
  const agentIsClose = (agentProfile || '').toLowerCase().includes('close');

  router.use(
    makeProxyWithRetry({
      target,
      changeOrigin: true,
      agent,                                 // ← usa el agente según perfil
      pathRewrite: prependBasePath ? (incomingPath) => `${path}${incomingPath}` : undefined,
      timeout: 60_000,
      proxyTimeout: 55_000,

      onProxyReq(proxyReq, req) {
        // si usamos perfil "close", fuerza cierre en este hop
        if (agentIsClose) {
          proxyReq.setHeader('Connection', 'close');
          // en Node >= 18 también:
          // proxyReq.shouldKeepAlive = false;
        }

        req._gwUpStart = process.hrtime.bigint();
        if (req.id) proxyReq.setHeader('X-Request-Id', req.id);

        if (LOG_UPSTREAM && matchOnlyPath(req.originalUrl || req.url)) {
          logger.info('[GW-HIT]', {
            requestId: req.id,
            method: req.method,
            url: req.originalUrl || req.url,
            target,
            agentProfile,
          });
        }
      },

      onProxyRes(proxyRes, req) {
        const dtMs = req._gwUpStart ? Number(process.hrtime.bigint() - req._gwUpStart) / 1e6 : undefined;

        if (LOG_UPSTREAM && matchOnlyPath(req.originalUrl || req.url) &&
            (SLOW_MS === 0 || (dtMs != null && dtMs >= SLOW_MS))) {
          const h = proxyRes.headers || {};
          logger.info('[GW-OUT]', {
            requestId: req.id,
            method: req.method,
            url: req.originalUrl || req.url,
            target,
            status: proxyRes.statusCode,
            server: h['server'],
            via: h['via'],
            xUp: h['x-envoy-upstream-service-time'] || h['x-response-time'],
            contentLength: h['content-length'],
            upstreamMs: dtMs != null ? Math.round(dtMs) : undefined,
            retried: !!req.__retried,
            agentProfile,
          });
        }
      },

      onError: (err, req, res) => {
        logger.error('[ProxyError]', {
          requestId: req.id,
          target,
          code: err?.code,
          message: err?.message,
          url: req?.originalUrl || req?.url,
          retried: !!req.__retried,
          agentProfile,
        });
        const timeoutish = err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
        if (!res.headersSent) {
          res.status(timeoutish ? 504 : 502).json({ message: 'Microservicio no disponible' });
        }
      },
    })
  );

  return { mountPoint: path, handler: router, breaker };
}