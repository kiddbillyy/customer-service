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
// src/proxy/routeFactory.js
// src/proxy/routeFactory.js
/* import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import createBreaker from '../utils/createBreaker.js';
import auth from '../middlewares/auth.js';
import rbac from '../middlewares/rbac.js';
import http from 'node:http';
import { logger } from '../middlewares/logger.js';
import Agent from 'agentkeepalive';

export const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 10_000,   // heartbeat razonable
  maxSockets: 256,
  maxFreeSockets: 16,
  freeSocketTimeout: 15_000, // sockets libres mueren antes que el server
  socketActiveTTL: 45_000,   // no reutilices sockets >45s
  scheduling: 'fifo',        // menos propenso a “recoger” sockets zombis
  noDelay: true,
});


// Control de logging por variables de entorno
const LOG_UPSTREAM = String(process.env.LOG_UPSTREAM || '').toLowerCase() === '1' ||
                     String(process.env.LOG_UPSTREAM || '').toLowerCase() === 'true';
const ONLY_PATH    = process.env.LOG_UPSTREAM_ONLY_PATH || ''; // ej: "/api/oms-service"
const SLOW_MS      = Number(process.env.LOG_UPSTREAM_SLOW_MS || '0');

// Mensaje al cargar el módulo (útil para confirmar que este archivo es el que corre)
try { logger.info('[GW-MODULE]', { file: import.meta.url }); } catch { /* noop en tests / }

function matchOnlyPath(url = '') {
  // Si se define ONLY_PATH, solo loguea para ese prefijo; si está vacío, loguea todo
  return !ONLY_PATH || url.startsWith(ONLY_PATH);
}

const gwOnError = (err, req, res) => {
  // escribe SIEMPRE algo visible aunque winston esté callado
  process.stdout.write(`[GW onError] ${req.method} ${req.originalUrl} :: ${err.code||'NO_CODE'} ${err.message}\n`);

  const canRetry =
    req.method === 'GET' &&
    !res.headersSent &&
    (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ETIMEDOUT') &&
    (req.socket?.bytesWritten ?? 0) === 0 &&
    !req._gwRetried;

  if (canRetry) {
    req._gwRetried = true;
    // Reintenta con las MISMAS opciones (incluye onError y timeouts)
    return makeProxy(target)(req, res);
  }

  const timeoutish = err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
  if (!res.headersSent) {
    res.status(timeoutish ? 504 : 502).json({ message: 'Microservicio no disponible' });
  }
};


export function makeRoute({
  path,
  target,
  requireAuth = false,
  requireRbac = false,
  publicPaths = [],
  prependBasePath = true,
}) {
  // Log de alta de ruta (una vez por servicio)
  logger.info('[GW-ROUTE]', { path, target, requireAuth, requireRbac, prependBasePath });

  const breaker = createBreaker(target);
  const router = express.Router();

  // Auth + RBAC (sin cambiar la semántica del original)
  if (requireAuth) {
    router.use((req, res, next) => {
      const rel = (req.originalUrl || req.url || '').replace(path, '') || '/';
      const isPublic = publicPaths.some((p) => rel.startsWith(p));
      if (isPublic) return next();
      return auth(req, res, (err) => (err ? next(err) : (requireRbac ? rbac(req, res, next) : next())));
    });
  }

  router.use(
    createProxyMiddleware({
      target,
      changeOrigin: true,
      agent: httpAgent,
      pathRewrite: prependBasePath ? (incomingPath) => `${path}${incomingPath}` : undefined,

      // timeouts alineados con el server original
      timeout: 65_000,      // total cliente→gateway
      proxyTimeout: 60_000, // inactividad gateway→upstream

      onProxyReq(proxyReq, req) {
        // cronómetro para medir upstream
        req._gwUpStart = process.hrtime.bigint();
        // Propaga el request-id si existe
        if (req.id) proxyReq.setHeader('X-Request-Id', req.id);

        // Log corto de entrada al proxy (filtrado por env)
        if (LOG_UPSTREAM && matchOnlyPath(req.originalUrl || req.url)) {
          logger.info('[GW-HIT]', {
            requestId: req.id,
            method: req.method,
            url: req.originalUrl || req.url,
            target,
          });
        }
      },

      onProxyRes(proxyRes, req) {
        const dtMs =
          req._gwUpStart ? Number(process.hrtime.bigint() - req._gwUpStart) / 1e6 : undefined;

        // Log de salida del upstream (opcionalmente solo si supera SLOW_MS)
        if (
          LOG_UPSTREAM &&
          matchOnlyPath(req.originalUrl || req.url) &&
          (SLOW_MS === 0 || (dtMs != null && dtMs >= SLOW_MS))
        ) {
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
          });
        }
      },

      // Mapeo de errores a 504/502 (con log estructurado)

      
      onError: (err, req, res) => {
        console.log("ERROR: ",err,"Y CODE: ",err.code)
        const canRetry =
          req.method === 'GET' &&
          !res.headersSent &&
          (err.code === 'ECONNRESET' || err.code === 'EPIPE') &&
          (req.socket?.bytesWritten ?? 0) === 0 &&
          !req._gwRetried;

        if (canRetry) {
          req._gwRetried = true;
          return createProxyMiddleware({ target, changeOrigin: true, agent: httpAgent })(req, res);
        }

        const timeoutish = err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
        res.status(timeoutish ? 504 : 502).json({ message: 'Microservicio no disponible' });
      }

    })
  );

  return { mountPoint: path, handler: router, breaker };
}
 */

// src/proxy/routeFactory.js
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import createBreaker from '../utils/createBreaker.js';
import auth from '../middlewares/auth.js';
import rbac from '../middlewares/rbac.js';
import { logger } from '../middlewares/logger.js';
import Agent from 'agentkeepalive';

export const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 256,
  maxFreeSockets: 16,
  freeSocketTimeout: 60_000, // >= keepAliveTimeout del upstream
  socketActiveTTL: 55_000,   // < keepAliveTimeout del upstream
  scheduling: 'fifo',
  noDelay: true,
});

// --- control de logging por variables de entorno
const LOG_UPSTREAM = /^(1|true)$/i.test(String(process.env.LOG_UPSTREAM || ''));
const ONLY_PATH    = process.env.LOG_UPSTREAM_ONLY_PATH || ''; // ej: "/api/oms-service"
const SLOW_MS      = Number(process.env.LOG_UPSTREAM_SLOW_MS || '0');

try { logger.info('[GW-MODULE]', { file: import.meta.url }); } catch {}

function matchOnlyPath(url = '') {
  return !ONLY_PATH || url.startsWith(ONLY_PATH);
}

// --- manejador común de errores (incluye reintento 1x para GET)
function gwOnError(err, req, res, target) {
  // siempre a stdout para verlo en `docker logs` aunque winston esté en JSON
  process.stdout.write(
    `[GW onError] ${req.method} ${req.originalUrl} -> ${target} :: ${err?.code || 'NO_CODE'} ${err?.message || ''}\n`
  );

  const canRetry =
    req.method === 'GET' &&
    !res.headersSent &&
    (err?.code === 'ECONNRESET' || err?.code === 'EPIPE' || err?.code === 'ETIMEDOUT') &&
    (req.socket?.bytesWritten ?? 0) === 0 &&
    !req._gwRetried;

  if (canRetry) {
    req._gwRetried = true;
    process.stdout.write(`[GW retry] ${req.method} ${req.originalUrl} -> ${target}\n`);
    // reencola el mismo middleware (misma config)
    return makeProxy({ target, path: req.baseUrl || '', prependBasePath: false })(req, res);
  }

  const timeoutish = err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
  if (!res.headersSent) {
    res.status(timeoutish ? 504 : 502).json({ message: 'Microservicio no disponible' });
  }
}

// --- fábrica del proxy con TODA la config (se reutiliza para reintentos)
function makeProxy({ target, path, prependBasePath }) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    agent: httpAgent,
    logLevel: 'silent', // <- silencia "Error occurred while trying to proxy: ..."
    pathRewrite: prependBasePath ? (incomingPath) => `${path}${incomingPath}` : undefined,

    // timeouts alineados con tu servidor
    timeout: 65_000,      // total cliente→gateway
    proxyTimeout: 60_000, // inactividad gateway→upstream

    onProxyReq(proxyReq, req) {
      // cronómetro para medir al upstream
      req._gwUpStart = process.hrtime.bigint();

      if (req.id) proxyReq.setHeader('X-Request-Id', req.id);

      // fuerza que los timeouts del proxyReq llamen a onError
      proxyReq.setTimeout(60_000, () => {
        const e = new Error('upstream proxy timeout');
        e.code = 'ETIMEDOUT';
        // disparará onError del middleware
        try { proxyReq.destroy(e); } catch {}
      });

      if (LOG_UPSTREAM && matchOnlyPath(req.originalUrl || req.url)) {
        logger.info('[GW-HIT]', {
          requestId: req.id,
          method: req.method,
          url: req.originalUrl || req.url,
          target,
        });
      }
    },

    onProxyRes(proxyRes, req) {
      const dtMs = req._gwUpStart ? Number(process.hrtime.bigint() - req._gwUpStart) / 1e6 : undefined;

      // útil para detectar cierres del upstream
      const h = proxyRes.headers || {};
      if (h.connection === 'close') {
        process.stdout.write(`[GW hdr] ${req.method} ${req.originalUrl} -> connection: close\n`);
      }

      if (
        LOG_UPSTREAM &&
        matchOnlyPath(req.originalUrl || req.url) &&
        (SLOW_MS === 0 || (dtMs != null && dtMs >= SLOW_MS))
      ) {
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
        });
      }
    },

    onError: (err, req, res) => gwOnError(err, req, res, target),
  });
}

export function makeRoute({
  path,
  target,
  requireAuth = false,
  requireRbac = false,
  publicPaths = [],
  prependBasePath = true,
}) {
  logger.info('[GW-ROUTE]', { path, target, requireAuth, requireRbac, prependBasePath });

  const breaker = createBreaker(target);
  const router = express.Router();

  // Auth + RBAC (igual semántica que tenías)
  if (requireAuth) {
    router.use((req, res, next) => {
      const rel = (req.originalUrl || req.url || '').replace(path, '') || '/';
      const isPublic = publicPaths.some((p) => rel.startsWith(p));
      if (isPublic) return next();
      return auth(req, res, (err) => (err ? next(err) : (requireRbac ? rbac(req, res, next) : next())));
    });
  }

  // Proxy montado
  router.use(makeProxy({ target, path, prependBasePath }));

  return { mountPoint: path, handler: router, breaker };
}
