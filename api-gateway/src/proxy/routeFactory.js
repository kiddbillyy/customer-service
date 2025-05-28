// src/proxy/routeFactory.js
import { createProxyMiddleware } from 'http-proxy-middleware';
import createBreaker from '../utils/createBreaker.js';

export function makeRoute({ path, target }) {
  const breaker = createBreaker(target);
  
  return {
    mountPoint: path,                        // ej. "/api/orders"
    handler: createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (url) => `${path}${url}`,
      onProxyReq: (_proxyReq, req) => {
        if (!breaker.closed) return;
        throw new Error(`Circuit open for ${target}`);
      },
      onError: (_err, _req, res) => {
        res.status(502).json({ message: 'Microservice unavailable' });
      }
    }),
    breaker
  };
}
