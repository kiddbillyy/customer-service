

// src/infra/sapClient.js
const axios = require("axios");
const https = require("https");
const axiosRetry = require("axios-retry").default;


const baseURL = process.env.SAP_SL_BASE_URL;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Config global de retry (puedes tunear)
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  shouldResetTimeout: true,
  retryCondition: (error) => {
    return (
      error.code === "ECONNABORTED" || // timeout
      error.response?.status >= 500 || // errores 5xx
      !error.response                  // network drop
    );
  },
});

// Helper común para errores Axios → Error legible
function unwrapAxiosError(err) {
  const payload = err?.response?.data ?? err?.message ?? String(err);
  const e = new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  e.status = err?.response?.status;
  e.data = err?.response?.data;
  return e;
}

async function login() {
  const { SAP_SL_COMPANYDB, SAP_SL_USER, SAP_SL_PASSWORD } = process.env;
  const url = `${baseURL}/Login`;
  try {
    const { data, headers } = await axios.post(
      url,
      { CompanyDB: SAP_SL_COMPANYDB, UserName: SAP_SL_USER, Password: SAP_SL_PASSWORD },
      {
        httpsAgent,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        timeout: 15000,
      }
    );
    const cookie = (headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    return { cookie, sessionId: data.SessionId };
  } catch (err) {
    throw unwrapAxiosError(err);
  }
}

async function logout(cookie) {
  try {
    await axios.post(`${baseURL}/Logout`, null, {
      httpsAgent,
      headers: { Cookie: cookie },
      timeout: 10000,
    });
  } catch (e) {
    console.warn("⚠️ Logout SAP falló:", e.response?.data || e.message);
  }
}

async function post(path, body, cookie) {
  try {
    const { data } = await axios.post(`${baseURL}${path}`, body, {
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
  try {
    const { data } = await axios.get(`${baseURL}${path}`, {
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
