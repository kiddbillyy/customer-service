// src/config/sapSl.js
const axios = require('axios');
const https = require('https');
require('dotenv').config();

const sl = axios.create({
  baseURL   : process.env.SAP_BASE_URL.replace(/\/$/, ''),     // sin “/” final
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  headers   : { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout   : 30000
});

let cookies = null;
let exp = 0;

// ───── LOGIN ─────
async function login () {
  const { data, headers } = await sl.post('/Login', {
    CompanyDB: process.env.SAP_COMPANY_DB,
    UserName : process.env.SAP_USERNAME,
    Password : process.env.SAP_PASSWORD
  });

  // guarda SOLO las partes “clave=valor”
  cookies = headers['set-cookie']
              .map(c => c.split(';')[0])        // B1SESSION=…  |  ROUTEID=…
              .join('; ');
  exp = Date.now() + (data.SessionTimeout * 60 - 60) * 1000;   // -1 min
}

// ───── WRAPPER ─────
async function sapRequest (method, path, body) {
  if (!cookies || Date.now() > exp) await login();

  return sl.request({
    method,
    url   : path,          // e.g. "/U_MARCA"
    data  : body,
    headers: { Cookie: cookies }
  });
}

module.exports = { sapRequest };
