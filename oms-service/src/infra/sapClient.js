// src/infra/sapClient.js
const axios = require("axios");
const https = require("https");
const axiosRetry = require("axios-retry").default;

// ====== Env helpers (acepta SAP_SL_* o SAP_* ) ======
const pick = (...keys) => keys.map(k => (process.env[k] || "").trim()).find(v => !!v);

let baseURL = pick("SAP_SL_BASE_URL", "SAP_BASE_URL"); // soporte dual
const COMPANY_DB = pick("SAP_SL_COMPANYDB", "SAP_COMPANY_DB");
const USERNAME   = pick("SAP_SL_USER", "SAP_USERNAME"); // ¡ojo al nombre correcto!
const PASSWORD   = pick("SAP_SL_PASSWORD", "SAP_PASSWORD");

if (!baseURL) {
  throw new Error("Falta SAP_SL_BASE_URL o SAP_BASE_URL (ej: https://host:50000/b1s/v1)");
}
// normaliza baseURL (sin trailing slash)
if (baseURL.endsWith("/")) baseURL = baseURL.slice(0, -1);
if (!baseURL.startsWith("http://") && !baseURL.startsWith("https://")) {
  throw new Error(`SAP base URL debe incluir protocolo (http/https). Valor: ${baseURL}`);
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Retries globales para axios
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  shouldResetTimeout: true,
  retryCondition: (error) =>
    error.code === "ECONNABORTED" || error.response?.status >= 500 || !error.response,
});

// Helper de errores legibles
function unwrapAxiosError(err) {
  const payload = err?.response?.data ?? err?.message ?? String(err);
  const e = new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  e.status = err?.response?.status;
  e.data = err?.response?.data;
  return e;
}

// Construcción segura de URLs
const urlFor = (path) => `${baseURL}${path.startsWith("/") ? path : `/${path}`}`;

async function login() {
  const url = urlFor("/Login");

  // Validaciones previas para evitar 206 confusos
  if (!COMPANY_DB) throw new Error("Falta SAP_SL_COMPANYDB o SAP_COMPANY_DB");
  if (!USERNAME)   throw new Error("Falta SAP_SL_USER o SAP_USERNAME");
  if (!PASSWORD)   throw new Error("Falta SAP_SL_PASSWORD o SAP_PASSWORD");

  // Log seguro (sin password)
  console.log("[SAP][login] →", {
    url,
    baseURL,
    CompanyDB: COMPANY_DB,
    UserName: USERNAME,
    PasswordLen: (PASSWORD || "").length,
  });

  try {
    const { data, headers } = await axios.post(
      url,
      { CompanyDB: COMPANY_DB, UserName: USERNAME, Password: PASSWORD },
      {
        httpsAgent,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        timeout: 15000,
      }
    );

    const cookie = (headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    console.log("[SAP][login][OK]", { hasCookie: !!cookie, sessionId: data?.SessionId });
    return { cookie, sessionId: data.SessionId };
  } catch (err) {
    console.error("[SAP][login][ERROR]", err?.response?.data || err?.message);
    throw unwrapAxiosError(err);
  }
}

async function logout(cookie) {
  const url = urlFor("/Logout");
  try {
    await axios.post(url, null, {
      httpsAgent,
      headers: { Cookie: cookie },
      timeout: 10000,
    });
    console.log("[SAP][logout][OK]");
  } catch (e) {
    console.warn("⚠️ [SAP][logout][WARN]", e.response?.data || e.message);
  }
}

async function post(path, body, cookie) {
  const url = urlFor(path);
  try {
    const { data } = await axios.post(url, body, {
      httpsAgent,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 20000,
    });
    return data;
  } catch (err) {
    throw unwrapAxiosError(err);
  }
}

async function get(path, cookie) {
  const url = urlFor(path);
  try {
    const { data } = await axios.get(url, {
      httpsAgent,
      headers: { Cookie: cookie, Accept: "application/json" },
      timeout: 20000,
    });
    return data;
  } catch (err) {
    throw unwrapAxiosError(err);
  }
}

async function smokeTest() {
  try {
    const { cookie, sessionId } = await login();
    await logout(cookie);
    return { ok: true, sessionId };
  } catch (err) {
    const msg = err?.data || err?.message || String(err);
    return { ok: false, error: msg };
  }
}

module.exports = { login, logout, post, get, smokeTest };
