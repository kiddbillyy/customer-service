/* import { LRUCache } from 'lru-cache';
import micromatch    from 'micromatch';
import fetch         from 'node-fetch';

const TTL  = +process.env.RBAC_CACHE_TTL_MS || 10 * 60 * 1000; // 10 min
const HOST = process.env.IDSERVICE_INTERNAL || 'http://id-service:5007';

const cache = new LRUCache({ max: 20_000, ttl: TTL });

export default async function rbac(req, res, next) {
  if (!req.user) return res.status(500).json({ message: 'RBAC sin auth' });

  const { usuarioId, plataformaId } = req.user;
  const key = `${usuarioId}:${plataformaId}`;

  let rules = cache.get(key);
  if (!rules) {
    try {
      const url = `${HOST}/api/idservice/endpoints/allowedEndpoints`
                + `?user=${usuarioId}&plat=${plataformaId}`;
      console.log("Url desde el middleware: ",url)

      const apiResp = await fetch(url, {
        headers: { Authorization: `Bearer ${req.token}` },
        timeout: 8000
      });

      console.log("Respuesta desde el endppoint de permisos: ",apiResp)
      if (!apiResp.ok) throw new Error(`ID-Service ${apiResp.status}`);

      const data = await apiResp.json();
      rules = data.endpoints ?? [];
      cache.set(key, rules);
    } catch (err) {
      console.error('[RBAC] fetch error:', err);
      return res.status(502).json({ message: 'No se pudo validar permisos' });
    }
  }

  const allowed = rules.some(r =>
       r.metodoHttp === req.method &&
       micromatch.isMatch(req.path, r.path)
  );

  return allowed
    ? next()
    : res.status(403).json({ message: 'Sin permiso para este endpoint' });
}
 */

import { LRUCache } from 'lru-cache';
import micromatch   from 'micromatch';
import fetch        from 'node-fetch';

const TTL  = +process.env.RBAC_CACHE_TTL_MS || 1 * 60 * 1000;
const HOST = process.env.IDSERVICE_INTERNAL || 'http://id-service:5007';

const cache = new LRUCache({ max: 20_000, ttl: TTL });

export default async function rbac(req, res, next) {
  if (!req.user) return res.status(500).json({ message: 'RBAC sin auth' });

  const { usuarioId, plataformaId } = req.user;
  const key = `${usuarioId}:${plataformaId}`;

  let rules = cache.get(key);
  if (!rules) {
    const url = `${HOST}/api/idservice/endpoints/allowedEndpoints`
              + `?user=${usuarioId}&plat=${plataformaId}`;
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

  const fullPath = (req.baseUrl || '') + req.path; 

  const allowed = rules.some(r =>
    r.metodoHttp === req.method &&
    micromatch.isMatch(fullPath, r.path)
  );

  return allowed
    ? next()
    : res.status(403).json({ message: 'Sin permiso para este endpoint' });
}
