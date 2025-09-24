import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import createBreaker from '../utils/createBreaker.js';
import auth from '../middlewares/auth.js';
import rbac from '../middlewares/rbac.js';
import http from 'node:http';


const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 1024,
  maxFreeSockets: 256
});


export function makeRoute({ path, target,requireAuth = false, requireRbac = false, publicPaths = [], prependBasePath = true }) {
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
      timeout: 75_000,      // tiempo total para establecer/recibir respuesta
      proxyTimeout: 70_000, // inactividad del socket con el destino
      onProxyReq(proxyReq) {
        // ayuda a proxies intermedios a no cerrar el socket
        proxyReq.setHeader('Connection', 'keep-alive');
      },
      onError: (err, _req, res) => {
        /* console.error(`[ProxyError] ${target}:`, err.message); */
        console.error('[ProxyError]', {
          target,
          code: err.code,
          message: err.message,
          name: err.name
        });
        res.status(502).json({ message: 'Microservicio no disponible' });
      }
    })
  );

  return { mountPoint: path, handler: router, breaker };
}
