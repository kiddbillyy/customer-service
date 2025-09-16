// src/infra/sapClient.js
const axios = require("axios");
const https = require("https");

const baseURL = process.env.SAP_SL_BASE_URL;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function login() {
  const { SAP_SL_COMPANYDB, SAP_SL_USER, SAP_SL_PASSWORD } = process.env;
  const url = `${baseURL}/Login`;
  const { data, headers } = await axios.post(
    url,
    { CompanyDB: SAP_SL_COMPANYDB, UserName: SAP_SL_USER, Password: SAP_SL_PASSWORD },
    { httpsAgent, headers: { "Content-Type": "application/json", Accept: "application/json" }, timeout: 15000 }
  );
  const cookie = (headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
  return { cookie, sessionId: data.SessionId };
}

async function logout(cookie) {
  try {
    await axios.post(`${baseURL}/Logout`, null, { httpsAgent, headers: { Cookie: cookie }, timeout: 10000 });
  } catch (e) {
    console.warn("⚠️ Logout SAP falló:", e.response?.data || e.message);
  }
}

async function post(path, body, cookie) {
  const { data } = await axios.post(`${baseURL}${path}`, body, {
    httpsAgent,
    headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
    timeout: 15000
  });
  return data;
}

// 👉 Smoke test: intenta login y logout, solo para verificar credenciales/conectividad
async function smokeTest() {
  try {
    const { cookie, sessionId } = await login();
    await logout(cookie);
    return { ok: true, sessionId };
  } catch (err) {
    const msg = err?.response?.data || err?.message || String(err);
    return { ok: false, error: msg };
  }
}

module.exports = { login, logout, post, smokeTest };
