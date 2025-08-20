// src/proxy/routeFactory.js
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Buffer } from 'buffer';
import createBreaker from '../utils/createBreaker.js';

export function makeRoute({ path, target }) {
  const breaker = createBreaker(target);

  return {
    mountPoint: path,
    handler: createProxyMiddleware({
      target,
      changeOrigin: true,

      // ✅ Reescribe para mantener solo UNA instancia del path
      pathRewrite: (url) => `${path}${url}`, 

      onProxyReq: (proxyReq, req) => {
        if (breaker.closed) {
          // ✅ Reinyectar body si fue parseado por express.json()
          if (req.body && typeof req.body === 'object') {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        } else {
          throw new Error(`Circuit open for ${target}`);
        }
      },

      onError: (_err, _req, res) => {
        res.status(502).json({ message: 'Microservicio no disponible' });
      }
    }),
    breaker
  };
}
