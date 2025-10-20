// src/services/multivendeApi.js
import axios from 'axios';
import sql from 'mssql';
import { getPool } from '../db/connection.js';

const BASE = process.env.MV_BASE_URL || 'https://app.multivende.com';
const CLIENT_ID = process.env.MV_CLIENT_ID;
const CLIENT_SECRET = process.env.MV_CLIENT_SECRET;
const AUTH_CODE = process.env.MV_AUTH_CODE || null;      // solo primer intercambio
const REDIRECT_URI = process.env.MV_REDIRECT_URI || '';  // debe coincidir con el registrado
const PROVIDER = 'multivende';

// -----------------------------------------------------------------------------
// Estado en memoria (cache + lock)
// -----------------------------------------------------------------------------
let memToken = null;           // { accessToken, refreshToken, expiresAt, merchantId }
let refreshingPromise = null;  // single-flight para evitar múltiples refresh concurrentes
const SKEW_MS = 5 * 60 * 1000; // refrescar si faltan <5 min
function base64UrlDecode(str) {
  // pasa de base64url a base64
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  return Buffer.from(str, 'base64').toString('utf8');
}

function decodeJwtClaims(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const payloadJson = base64UrlDecode(parts[1]);
    return JSON.parse(payloadJson); // ¡sin verificar firma, solo lectura!
  } catch {
    return null;
  }
}

function extractFromMvClaims(claims) {
  if (!claims || typeof claims !== 'object') return {};
  // Multivende mete estos campos en el JWT:
  // expiresAt, refreshToken, refreshTokenExpiresAt, MerchantId, OauthClientId, etc.
  const isoExpires =
    claims.expiresAt ||
    (claims.exp ? new Date(claims.exp * 1000).toISOString() : null);

  return {
    merchantId: claims.MerchantId || claims.merchantId || null,
    clientId: claims.OauthClientId || claims.clientId || null,
    refreshToken: claims.refreshToken || null,
    refreshTokenExpiresAt: claims.refreshTokenExpiresAt || null,
    expiresAt: isoExpires || null,
  };
}

// -----------------------------------------------------------------------------
// BD OauthTokens
// -----------------------------------------------------------------------------
export async function getAuthFromDB() {
  const pool = await getPool();
  const q = await pool.request()
    .input('provider', sql.NVarChar(50), PROVIDER)
    .query(`
      SELECT TOP 1 * FROM dbo.OauthTokens
      WHERE provider = @provider
      ORDER BY updatedAt DESC
    `);
  return q.recordset[0] || null;
}

export async function upsertAuthInDB({ accessToken, refreshToken, expiresAt, merchantId = null }) {
  const pool = await getPool();
  await pool.request()
    .input('provider', sql.NVarChar(50), PROVIDER)
    .input('merchantId', sql.NVarChar(100), merchantId)
    .input('accessToken', sql.NVarChar(sql.MAX), accessToken)
    .input('refreshToken', sql.NVarChar(sql.MAX), refreshToken)
    .input('expiresAt', sql.DateTime2, expiresAt ? new Date(expiresAt) : null)
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.OauthTokens WHERE provider=@provider)
      BEGIN
        UPDATE dbo.OauthTokens
           SET accessToken = @accessToken,
               refreshToken = @refreshToken,
               expiresAt = @expiresAt,
               merchantId = ISNULL(@merchantId, merchantId),
               updatedAt = SYSDATETIME()
         WHERE provider = @provider;
      END
      ELSE
      BEGIN
        INSERT INTO dbo.OauthTokens (id, provider, merchantId, accessToken, refreshToken, expiresAt, createdAt, updatedAt)
        VALUES (NEWID(), @provider, @merchantId, @accessToken, @refreshToken, @expiresAt, SYSDATETIME(), SYSDATETIME());
      END
    `);

  // sincroniza cache en memoria
  memToken = {
    accessToken,
    refreshToken: refreshToken || null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    merchantId: merchantId || null,
  };
  return true;
}

// -----------------------------------------------------------------------------
// OAuth helpers (x-www-form-urlencoded)
// -----------------------------------------------------------------------------
function asForm(obj) {
  const form = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null) form.append(k, String(v));
  });
  return form;
}

async function exchangeCode(code) {
  const body = asForm({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });

  const { data } = await axios.post(`${BASE}/oauth/access-token`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return data; // { token, refreshToken, expiresAt, MerchantId? }
}

async function refreshWith(refreshToken) {
  const body = asForm({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    // algunos IdP piden redirect_uri en refresh; no molesta
    redirect_uri: REDIRECT_URI || '',
  });

  const { data } = await axios.post(`${BASE}/oauth/access-token`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return data;
}

function isExpiringSoon(expiresAt) {
  if (!expiresAt) return false; // si no hay expiración, no fuerces refresh
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  return msLeft <= SKEW_MS;
}

// -----------------------------------------------------------------------------
// Core refresh logic (con single-flight)
// -----------------------------------------------------------------------------
async function ensureFreshAuth() {
  // 1) cache en memoria lista y no expira pronto
  if (memToken?.accessToken && !isExpiringSoon(memToken.expiresAt)) {
    return memToken;
  }

  // 2) evita carreras
  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = (async () => {
    let auth = memToken || await getAuthFromDB();

    // Sembrado inicial desde AUTH_CODE si no hay nada
    if (!auth && AUTH_CODE) {
      try {
        const data = await exchangeCode(AUTH_CODE);
        await upsertAuthInDB({
          accessToken: data.token,
          refreshToken: data.refreshToken || null,
          expiresAt: data.expiresAt || null,
          merchantId: data?.MerchantId || null,
        });
        auth = await getAuthFromDB();
        console.log('[MV OAUTH] Exchange inicial OK (AUTH_CODE).');
      } catch (err) {
        console.error('[MV OAUTH] exchangeCode FAIL:', err?.response?.status, err?.response?.data || err.message);
        throw err;
      }
    }

    if (!auth) throw new Error('No hay credenciales MV en BD. Usa seed o AUTH_CODE.');

    // Si no hay refreshToken, no intentes refrescar; solo cachea y sigue.
    if (!auth.refreshToken || !isExpiringSoon(auth.expiresAt)) {
      memToken = {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken || null,
        expiresAt: auth.expiresAt ? new Date(auth.expiresAt) : null,
        merchantId: auth.merchantId || null,
      };
      return memToken;
    }

    // Hay refreshToken y está por expirar => refrescamos
    try {
      const data = await refreshWith(auth.refreshToken);
      await upsertAuthInDB({
        accessToken: data.token,
        refreshToken: data.refreshToken || auth.refreshToken,
        expiresAt: data.expiresAt || auth.expiresAt || null,
        merchantId: auth.merchantId || data?.MerchantId || null,
      });
      const fresh = await getAuthFromDB();
      memToken = {
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken || null,
        expiresAt: fresh.expiresAt ? new Date(fresh.expiresAt) : null,
        merchantId: fresh.merchantId || null,
      };
      console.log('[MV OAUTH] Token refrescado.');
      return memToken;
    } catch (err) {
      console.error('[MV OAUTH] refreshWith FAIL:', err?.response?.status, err?.response?.data || err.message);
      // Fallback: mantenemos el que había en BD (peor es nada)
      memToken = {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken || null,
        expiresAt: auth.expiresAt ? new Date(auth.expiresAt) : null,
        merchantId: auth.merchantId || null,
      };
      return memToken;
    }
  })();

  try {
    return await refreshingPromise;
  } finally {
    refreshingPromise = null;
  }
}

// -----------------------------------------------------------------------------
// API pública de token
// -----------------------------------------------------------------------------
/** Si hay seed por ENV, lo guarda en BD (una vez) y limpia ENV. */
export async function seedFromEnvIfAny() {
  const seeded = (process.env.MV_ACCESS_TOKEN && process.env.MV_ACCESS_TOKEN.trim() !== '');
  if (!seeded) return false;

  const accessToken = process.env.MV_ACCESS_TOKEN.trim().replace(/^Bearer\s+/i, '');
  const refreshToken = process.env.MV_REFRESH_TOKEN || null;
  const expiresAt = process.env.MV_EXPIRES_AT || null;

  await upsertAuthInDB({ accessToken, refreshToken, expiresAt });
  delete process.env.MV_ACCESS_TOKEN;
  delete process.env.MV_REFRESH_TOKEN;
  delete process.env.MV_EXPIRES_AT;

  console.log('[MV OAUTH] Token seed desde ENV guardado en BD.');
  return true;
}

export async function getAccessToken() {
  await seedFromEnvIfAny();
  await repairAuthRow();  
  const auth = await ensureFreshAuth();
  return auth?.accessToken || null;
}

/** Info útil para un endpoint /mv/oauth/status */
export async function oauthStatus() {
  const db = await getAuthFromDB();
  const mem = memToken;
  return {
    baseUrl: BASE,
    hasDB: !!db,
    hasMem: !!mem,
    merchantId: db?.merchantId || mem?.merchantId || null,
    hasRefreshToken: !!(db?.refreshToken || mem?.refreshToken),
    expiresAtDB: db?.expiresAt || null,
    expiresAtMem: mem?.expiresAt ? mem.expiresAt.toISOString() : null,
  };
}

// -----------------------------------------------------------------------------
// Axios autorizado (con retry 401 una vez)
// -----------------------------------------------------------------------------
let axiosMV; // instancia singleton
export async function getAuthorizedAxios() {
  await seedFromEnvIfAny();
  await ensureFreshAuth();

  if (!axiosMV) {
    axiosMV = axios.create({
      baseURL: BASE,
      timeout: 15000,
    });

    // Interceptor de request: añade Bearer
    axiosMV.interceptors.request.use(async (config) => {
      const token = (memToken?.accessToken) || (await getAccessToken());
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      config.headers.Accept = 'application/json';
      return config;
    });

    // Interceptor de response: si 401 y tenemos refreshToken -> refresca 1 vez y reintenta
    axiosMV.interceptors.response.use(
      (res) => res,
      async (err) => {
        const original = err.config || {};
        const status = err?.response?.status;

        const canRetry = status === 401 && !original.__mvRetried && memToken?.refreshToken;
        if (!canRetry) throw err;

        original.__mvRetried = true;
        // forzamos refresh (vía ensureFreshAuth, respetando single-flight)
        await ensureFreshAuth();
        // reintenta con el token actualizado
        return axiosMV(original);
      }
    );
  }

  return axiosMV;
}


export async function seedWithAuthCode(code) {
  // Intercambia el auth code por tokens
  const data = await (async () => {
    const form = new URLSearchParams();
    form.append('client_id', process.env.MV_CLIENT_ID);
    form.append('client_secret', process.env.MV_CLIENT_SECRET);
    form.append('grant_type', 'authorization_code');
    form.append('code', code);
    form.append('redirect_uri', process.env.MV_REDIRECT_URI || '');

    const { data } = await axios.post(
      `${BASE}/oauth/access-token`,
      form,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );
    return data; // { token, refreshToken, expiresAt, MerchantId? }
  })();

  // Guarda/actualiza en BD
  await upsertAuthInDB({
    accessToken: data.token,
    refreshToken: data.refreshToken || null,
    expiresAt: data.expiresAt || null,
    merchantId: data?.MerchantId || null,
  });

  return {
    provider: 'multivende',
    merchantId: data?.MerchantId || null,
    expiresAt: data?.expiresAt || null,
  };
}
// -----------------------------------------------------------------------------
// Endpoints específicos de negocio (ejemplo)
// -----------------------------------------------------------------------------
export async function getCheckout(checkoutId) {
  const api = await getAuthorizedAxios();
  const res = await api.get(`/api/checkouts/${checkoutId}`, { validateStatus: s => s === 200 || s === 404 });
  return res.status === 200 ? res.data : null;
}

export async function repairAuthRow() {
  const row = await getAuthFromDB();
  if (!row || (!row.accessToken)) return false;

  // ya completo, no hay nada que reparar
  if (row.refreshToken && row.expiresAt) return false;

  const claims = decodeJwtClaims(row.accessToken);
  const extracted = extractFromMvClaims(claims);

  // si no pudimos extraer nada útil, no hacemos nada
  if (!extracted.refreshToken && !extracted.expiresAt) return false;

  await upsertAuthInDB({
    accessToken: row.accessToken,
    refreshToken: row.refreshToken || extracted.refreshToken || null,
    expiresAt: row.expiresAt || extracted.expiresAt || null,
    merchantId: row.merchantId || extracted.merchantId || null,
  });

  return true;
}
