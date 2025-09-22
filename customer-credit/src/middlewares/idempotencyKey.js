const memoryKeys = new Map(); // puedes migrar a tabla/redis

export function idempotencyKey(req, res, next) {
  const key = req.header('Idempotency-Key');
  if (!key) return res.status(400).json({ error: 'Idempotency-Key requerido' });
  if (memoryKeys.has(key)) return res.status(409).json({ error: 'Repetido' });
  memoryKeys.set(key, Date.now());
  next();
}
