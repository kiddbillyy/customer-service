// src/middlewares/rateLimiter.js
import rateLimit from 'express-rate-limit';

export default rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: false // (por defecto es false; no lo declares)
});
