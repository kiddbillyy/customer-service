// src/metrics.js
import prom from 'prom-client';
prom.collectDefaultMetrics();

export const httpDuration = new prom.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Latencia HTTP del gateway',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

export const upstreamErrors = new prom.Counter({
  name: 'gateway_upstream_errors_total',
  help: 'Errores hacia upstream (proxy/servicios)',
  labelNames: ['target', 'code'],
});

export function metricsEndpoint() {
  return async (_req, res) => {
    res.set('Content-Type', prom.register.contentType);
    res.end(await prom.register.metrics());
  };
}
