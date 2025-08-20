// src/utils/createBreaker.js
import CircuitBreaker from 'opossum';

export default function createBreaker(target) {
  const breaker = new CircuitBreaker(
    (url) => fetch(url, { method: 'HEAD' }),      // petición ligerísima
    { timeout: 3000, errorThresholdPercentage: 50, resetTimeout: 10000 }
  );

  // Warm‑up (no interrumpe el arranque si /health aún no está listo)
  breaker.fire(`${target}/health`).catch(() => {});

  return breaker;
}