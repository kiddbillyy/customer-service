// src/utils/createBreaker.js
import CircuitBreaker from 'opossum';

export default function createBreaker(target) {
  return new CircuitBreaker(
    (url) => fetch(url, { method: 'HEAD', timeout: 2000 }),
    { timeout: 3000, errorThresholdPercentage: 50, resetTimeout: 10000 }
  ).fire(`${target}/health`);   // suponemos endpoint /health en cada servicio
}
