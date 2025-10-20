// src/services/tokenRefresher.js
import { getAccessToken, oauthStatus, seedFromEnvIfAny } from './multivendeApi.js';

export function startTokenRefresher({ intervalMs = 5 * 60 * 1000 } = {}) {
  let timer = null;

  async function tick() {
    try {
      // si hay seed en ENV (MV_ACCESS_TOKEN, etc.), se guarda una vez en BD
      await seedFromEnvIfAny();

      // obtener token fuerza refresh si corresponde (usa cache + single-flight)
      const token = await getAccessToken();
      const status = await oauthStatus();

      const peek = token?.length > 12 ? `${token.slice(0, 6)}...${token.slice(-4)}` : '(token corto)';
      const exp = status.expiresAtMem || status.expiresAtDB || '(sin expiración)';

      console.log(
        `[MV OAUTH] TOKEN LISTO (expira: ${exp})` +
        `${status.hasRefreshToken ? ' [con refreshToken]' : ''} token=${peek}`
      );
    } catch (e) {
      console.error('[MV OAUTH] Refresher error:', e?.response?.status, e?.response?.data || e.message);
    }
  }

  // primer tick inmediato y luego cada intervalo
  tick();
  timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}

// Helpers opcionales para otros módulos:
export async function getCurrentToken() {
  return getAccessToken(); // también refresca si hace falta
}

export async function forceRefresh() {
  // mismo efecto: getAccessToken() decide refrescar si expira pronto
  return getAccessToken();
}

export async function oauthDebugStatus() {
  return oauthStatus();
}
