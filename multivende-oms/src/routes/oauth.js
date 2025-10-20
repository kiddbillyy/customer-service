// src/routes/oauth.js
import { Router } from 'express';
import {
  getAuthFromDB,
  getAccessToken,    // obtiene y refresca si corresponde
  oauthStatus,      // snapshot útil para debug
  seedWithAuthCode, // intercambia AUTH CODE -> tokens y guarda en BD
  seedFromEnvIfAny, // guarda en BD si hay MV_ACCESS_TOKEN en ENV
} from '../services/multivendeApi.js';

const router = Router();

// Helper para no exponer el token completo
const mask = (t = '', start = 6, end = 4) =>
  t && t.length > start + end ? `${t.slice(0, start)}...${t.slice(-end)}` : t;

// Protección simple por header (opcional)
function checkAdmin(req, res) {
  const adminKey = process.env.REFRESH_ADMIN_KEY || '';
  if (!adminKey) return true;
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== adminKey) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

// Forzar/obtener token (refresca si está por expirar)
router.post('/oauth/refresh', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    await seedFromEnvIfAny(); // por si dejaste un seed en ENV
    const token = await getAccessToken();
    if (!token) return res.status(500).json({ ok: false, error: 'no access token' });

    const auth = await getAuthFromDB(); // para mostrar metadata
    return res.json({
      ok: true,
      provider: 'multivende',
      merchantId: auth?.merchantId || null,
      expiresAt: auth?.expiresAt || null,
      accessToken: mask(token),
      hasRefreshToken: !!auth?.refreshToken,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.response?.data || err.message });
  }
});

// Estado OAuth (DB + cache memoria)
router.get('/oauth/status', async (_req, res) => {
  try {
    const status = await oauthStatus();
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Sembrar tokens con AUTH CODE (primer intercambio)
router.post('/oauth/seed-from-code', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ ok: false, error: 'code requerido' });
    const seeded = await seedWithAuthCode(code);
    res.json({ ok: true, seeded });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});

// Sembrar desde ENV (MV_ACCESS_TOKEN / MV_REFRESH_TOKEN / MV_EXPIRES_AT)
router.post('/oauth/seed-from-env', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const did = await seedFromEnvIfAny();
    res.json({ ok: true, seededFromEnv: did });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ver último registro en BD (enmascarado)
router.get('/oauth/db', async (_req, res) => {
  try {
    const auth = await getAuthFromDB();
    if (!auth) return res.json({ ok: true, exists: false });

    const msLeft = auth.expiresAt ? (new Date(auth.expiresAt).getTime() - Date.now()) : null;
    res.json({
      ok: true,
      exists: true,
      provider: 'multivende',
      merchantId: auth.merchantId || null,
      expiresAt: auth.expiresAt || null,
      msUntilExpiry: msLeft,
      accessToken: mask(auth.accessToken || ''),
      hasRefreshToken: !!auth.refreshToken,
      updatedAt: auth.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
