import rateLimit from 'express-rate-limit';
export default rateLimit({ windowMs: 60_000, max: 300 });