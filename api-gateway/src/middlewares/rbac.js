import { LRUCache } from 'lru-cache';
import micromatch   from 'micromatch';
import fetch        from 'node-fetch';

const TTL  = +process.env.RBAC_CACHE_TTL_MS || 1 * 60 * 1000;
const HOST = process.env.IDSERVICE_INTERNAL || 'http://id-service:5007';

const cache = new LRUCache({ max: 20_000, ttl: TTL });

const norm = (s) => (s ?? '').toString().trim();

function toGlob(pattern = '') {
  let p = pattern;
  p = p.replace(/:[^/]+/g, '*');
  p = p.replace(/{[^/]+}/g, '*');
  return p;
}

function ensureCoversChildren(pattern = '') {
  const hasWildcard   = pattern.includes('*');
  const hasParamStyle = /:[^/]+/.test(pattern) || /{[^/]+}/.test(pattern);
  if (!hasWildcard && !hasParamStyle) {
    return pattern.endsWith('/') ? `${pattern}**` : `${pattern}/**`;
  }
  return pattern;
}

export default async function rbac(req, res, next) {
  if (!req.user) return res.status(500).json({ message: 'RBAC sin auth' });

  const { usuarioId, plataformaId } = req.user;
  const key = `${usuarioId}:${plataformaId}`;

  let rules = cache.get(key);
  if (!rules) {
    const url = `${HOST}/api/idservice/endpoints/allowedEndpoints?user=${usuarioId}&plat=${plataformaId}`;
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${req.token}` },
        timeout: 8000
      });
      if (!r.ok) throw new Error(`ID-Service ${r.status}`);
      const data = await r.json();
      rules = data.endpoints ?? [];
      cache.set(key, rules);
    } catch (e) {
      console.error('[RBAC] fetch:', e);
      return res.status(502).json({ message: 'No se pudo validar permisos' });
    }
  }

  // fullPath incluye el mountPoint del proxy y el path relativo
  const fullPath = norm((req.baseUrl || '') + (req.path || ''));
  const metodo   = norm(req.method).toUpperCase();

  const allowed = rules.some((r) => {
    const rMethod = norm(r.metodoHttp).toUpperCase();
    // 1) normaliza patrón
    let pattern = norm(r.path);
    // 2) bonus: extiende rutas base para cubrir hijos
    pattern = ensureCoversChildren(pattern);
    // 3) convierte placeholders a globs
    pattern = toGlob(pattern);

    return (
      rMethod === metodo &&
      micromatch.isMatch(fullPath, pattern, { nocase: true })
    );
  });

  return allowed
    ? next()
    : res.status(403).json({ message: 'Tu usuario no tiene permiso para esta ruta' });
}