// src/proxy/routeFactory.js
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Buffer } from 'buffer';
import createBreaker from '../utils/createBreaker.js';
import auth from '../middlewares/auth.js';

export function makeRoute({ path, target, requireAuth = false, publicPaths = [], prependBasePath = true }) {
  const breaker = createBreaker(target);
  const router = express.Router();

  if (requireAuth) {
    router.use((req, res, next) => {
      const rel = (req.originalUrl || req.url || '').replace(path, '') || '/';
      const isPublic = publicPaths.some(p => rel.startsWith(p));
      if (isPublic) return next();
      return auth(req, res, next);
    });
  }

  router.use(
    createProxyMiddleware({
      target,
      changeOrigin: true,
      // ⬇️ Si tu micro usa prefijo, prependemos el mountPoint:
      pathRewrite: prependBasePath
        ? (incomingPath) => `${path}${incomingPath}`  // '/api/catalog' + '/getcategory'
        : undefined,

      onProxyReq: (proxyReq, req) => {
        if (!breaker.closed) throw new Error(`Circuit open for ${target}`);
        const method = req.method.toUpperCase();
        const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
        const isJSON = (req.headers['content-type'] || '').includes('application/json');
        if (hasBody && isJSON && req.body && typeof req.body === 'object') {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },

      onError: (err, _req, res) => {
        console.error(`[ProxyError] ${target}:`, err.message);
        res.status(502).json({ message: 'Microservicio no disponible' });
      }
    })
  );

  return { mountPoint: path, handler: router, breaker };
}
