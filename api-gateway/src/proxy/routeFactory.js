import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import createBreaker from '../utils/createBreaker.js';
import auth from '../middlewares/auth.js';
import rbac from '../middlewares/rbac.js';

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
      pathRewrite: prependBasePath
        ? (incomingPath) => `${path}${incomingPath}`
        : undefined,
      timeout: 15000,
      proxyTimeout: 15000,
      onError: (err, _req, res) => {
        console.error(`[ProxyError] ${target}:`, err.message);
        res.status(502).json({ message: 'Microservicio no disponible' });
      }
    })
  );

  return { mountPoint: path, handler: router, breaker };
}
