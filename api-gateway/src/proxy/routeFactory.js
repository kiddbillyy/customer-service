// src/proxy/routeFactory.js
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
  maxFreeSockets: 16,     // ↓ menos sockets ociosos acumulados
  freeSocketTimeout: 1_000, // ← más bajo que tu intervalo típico (1.5s) y, sobre todo, que el idle del hop
  socketActiveTTL: 30_000,
  scheduling: 'lifo'      // usa primero el socket más reciente del pool (evita pescar los más viejos)
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
      timeout: 75_000,      // tiempo total de la request (cliente→gateway)
      proxyTimeout: 70_000, // inactividad del socket (gateway→upstream)

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
