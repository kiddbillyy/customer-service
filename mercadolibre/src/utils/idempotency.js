// Idempotencia mínima en memoria (cámbialo por Redis/DB en producción)
// Guarda una firma por (topic + resource) por un tiempo breve
const seen = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 min


export function wasRecentlySeen(key) {
const now = Date.now();
const hit = seen.get(key);
if (hit && (now - hit) < TTL_MS) return true;
seen.set(key, now);
// Limpieza ocasional
if (seen.size > 5000) {
for (const [k, ts] of seen.entries()) {
if (now - ts > TTL_MS) seen.delete(k);
}
}
return false;
}