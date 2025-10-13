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

// Mensaje al cargar el módulo (útil para confirmar que este archivo es el que corre)
try { logger.info('[GW-MODULE]', { file: import.meta.url }); } catch { /* noop en tests / }

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
} */
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import createBreaker from '../utils/createBreaker.js';
import auth from '../middlewares/auth.js';
import rbac from '../middlewares/rbac.js';
import http from 'node:http';
import { logger } from '../middlewares/logger.js';
import Agent from 'agentkeepalive';

const DEBUG_SOCKETS = /^(1|true)$/i.test(process.env.DEBUG_SOCKETS || '');

// --- Ajustes del pool de sockets (mantiene el comportamiento estable del original)
/* const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 512,
  maxFreeSockets: 2,
  freeSocketTimeout: 30_000,
  scheduling: 'lifo',
  noDelay: true,
  keepAliveMsecs: 1_000,
}); */
const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxFreeSockets: 2,
  freeSocketTimeout: 2000,   // expira libres muy rápido
  socketActiveTTL: 10000,    // jubila aunque estén en uso por “edad”
  scheduling: 'lifo',
});

// Helpers de conteo para el Agent
function _sumDictArrays(dict) {
  if (!dict) return 0;
  const values = dict instanceof Map ? Array.from(dict.values()) : Object.values(dict);
  return values.reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
}
function agentSnapshot(agent) {
  return {
    active: _sumDictArrays(agent.sockets),
    free: _sumDictArrays(agent.freeSockets),
    pending: _sumDictArrays(agent.requests),
    keepAlive: agent.keepAlive,
    maxSockets: agent.maxSockets,
    maxFreeSockets: agent.maxFreeSockets,
    freeSocketTimeout: agent.freeSocketTimeout,
    socketActiveTTL: agent.socketActiveTTL,
    scheduling: agent.scheduling,
  };
}
function logAgent(label, target, extra = {}) {
  if (!DEBUG_SOCKETS) return;
  try {
    const snap = agentSnapshot(httpAgent);
    console.log(`[AGENT] ${label}`, { target, ...snap, ...extra });
  } catch (e) {
    console.log('[AGENT] snapshot error', e?.message);
  }
}

// Observa eventos del Agent (opcionales, verbosos)
if (DEBUG_SOCKETS) {
  httpAgent.on('free', (socket, opts) => {
    console.log('[AGENT] free', {
      host: opts?.host, port: opts?.port, reusedSocket: !!socket?.reusedSocket,
      connecting: !!socket?.connecting, destroyed: !!socket?.destroyed,
    });
  });
  httpAgent.on('timeout', (socket) => {
    console.log('[AGENT] timeout', {
      local: `${socket?.localAddress || ''}:${socket?.localPort || ''}`,
      remote: `${socket?.remoteAddress || ''}:${socket?.remotePort || ''}`,
      reusedSocket: !!socket?.reusedSocket,
    });
  });
  httpAgent.on('close', (socket) => {
    console.log('[AGENT] close', { destroyed: !!socket?.destroyed });
  });
}

// Control de logging por variables de entorno
const LOG_UPSTREAM = String(process.env.LOG_UPSTREAM || '').toLowerCase() === '1' ||
                     String(process.env.LOG_UPSTREAM || '').toLowerCase() === 'true';
const ONLY_PATH    = process.env.LOG_UPSTREAM_ONLY_PATH || ''; // ej: "/api/oms-service"
const SLOW_MS      = Number(process.env.LOG_UPSTREAM_SLOW_MS || '0');

// Mensaje al cargar el módulo (útil para confirmar que este archivo es el que corre)
try { logger.info('[GW-MODULE]', { file: import.meta.url }); } catch { /* noop en tests */ }

function matchOnlyPath(url = '') {
  return !ONLY_PATH || url.startsWith(ONLY_PATH);
}

// Adjunta introspección al socket de una request saliente
function attachSocketDebug(proxyReq, req, target) {
  if (!DEBUG_SOCKETS) return;

  proxyReq.on('socket', (sock) => {
    // Este evento ocurre cuando el Agent asigna un socket a la request
    const first = {
      reusedSocket: !!sock?.reusedSocket,
      connecting: !!sock?.connecting,
      destroyed: !!sock?.destroyed,
      local: `${sock?.localAddress || ''}:${sock?.localPort || ''}`,
      remote: `${sock?.remoteAddress || ''}:${sock?.remotePort || ''}`, // si es socket reutilizado, suele venir poblado
    };
    console.log('[SOCK] assign', {
      requestId: req.id, method: req.method, url: req.originalUrl || req.url, target, ...first,
    });

    sock.once('connect', () => {
      console.log('[SOCK] connect', {
        requestId: req.id,
        local: `${sock?.localAddress || ''}:${sock?.localPort || ''}`,
        remote: `${sock?.remoteAddress || ''}:${sock?.remotePort || ''}`,
        reusedSocket: !!sock?.reusedSocket,
      });
    });
    sock.once('timeout', () => {
      console.log('[SOCK] timeout', {
        requestId: req.id,
        reusedSocket: !!sock?.reusedSocket,
        destroyed: !!sock?.destroyed,
      });
    });
    sock.once('end', () => {
      console.log('[SOCK] end', {
        requestId: req.id,
        reusedSocket: !!sock?.reusedSocket,
        destroyed: !!sock?.destroyed,
      });
    });
    sock.once('close', (hadError) => {
      console.log('[SOCK] close', {
        requestId: req.id,
        hadError: !!hadError,
        reusedSocket: !!sock?.reusedSocket,
        destroyed: !!sock?.destroyed,
      });
    });
    sock.on('error', (err) => {
      console.log('[SOCK] error', {
        requestId: req.id, code: err?.code, message: err?.message,
      });
    });
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
  // Log de alta de ruta (una vez por servicio)
  logger.info('[GW-ROUTE]', { path, target, requireAuth, requireRbac, prependBasePath });

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

  router.use(
    createProxyMiddleware({
      target,
      changeOrigin: true,
      agent: httpAgent,
      pathRewrite: prependBasePath ? (incomingPath) => `${path}${incomingPath}` : undefined,

      // timeouts alineados con el server original
      timeout: 60_000,      // cliente→gateway
      proxyTimeout: 55_000, // gateway→upstream (idle)

      onProxyReq(proxyReq, req) {
        req._gwUpStart = process.hrtime.bigint();
        if (req.id) proxyReq.setHeader('X-Request-Id', req.id);
        /* proxyReq.setHeader('Connection', 'keep-alive'); */

        // Introspección de socket
        attachSocketDebug(proxyReq, req, target);

        if (DEBUG_SOCKETS) {
          // Snapshot del Agent ANTES de salir
          logAgent('before-upstream', target, {
            requestId: req.id,
            method: req.method,
            url: req.originalUrl || req.url,
          });
          // Algunas cabeceras de interés que salen
          console.log('[HDR OUT]', {
            requestId: req.id,
            host: proxyReq?.getHeader?.('host'),
            connection: proxyReq?.getHeader?.('connection'),
            'content-length': proxyReq?.getHeader?.('content-length'),
          });
        }

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

        if (DEBUG_SOCKETS) {
          // Headers relevantes del upstream
          const h = proxyRes.headers || {};
          console.log('[HDR IN]', {
            requestId: req.id,
            status: proxyRes.statusCode,
            connection: h['connection'],
            keepAlive: h['keep-alive'],
            via: h['via'],
            server: h['server'],
            'content-length': h['content-length'],
          });

          // Snapshot del Agent DESPUÉS de recibir headers
          logAgent('after-headers', (req.originalUrl || req.url) + ' -> ' + target, {
            status: proxyRes.statusCode,
          });

          // Al finalizar el stream de respuesta
          proxyRes.once('end', () => {
            logAgent('after-res-end', target, {
              requestId: req.id,
              status: proxyRes.statusCode,
            });
          });
          proxyRes.once('close', () => {
            console.log('[RES] close', { requestId: req.id });
          });
          proxyRes.once('aborted', () => {
            console.log('[RES] aborted', { requestId: req.id });
          });
        }
        console.log('[HEADERS IN]', {
            url: req.originalUrl,
            status: proxyRes.statusCode,
            connectionHeader: proxyRes.headers['connection'] // <-- La cabecera clave
        });


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

      onError: (err, req, res) => {
        if (DEBUG_SOCKETS) {
          logAgent('onError', target, { requestId: req.id, errCode: err?.code });
          console.log('[ERR]', {
            requestId: req.id,
            code: err?.code,
            message: err?.message,
            syscall: err?.syscall,
            address: err?.address,
            port: err?.port,
          });
        }

        logger.error('[ProxyError]', {
          requestId: req.id,
          target,
          code: err?.code,
          message: err?.message,
          url: req?.originalUrl || req?.url,
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
